import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import indexRouter from './routes/index';
import apiRouter from './routes/api';
import passport from 'passport';
import cookieSession from 'cookie-session';
import bodyParser from 'body-parser'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import * as dotenv from 'dotenv' 
import mongoose from 'mongoose';
import User from './model/User';
import moment from 'moment';
import * as refresh from 'passport-oauth2-refresh';
import {Miro} from '@mirohq/miro-api'

dotenv.config()

const miro = new Miro()

mongoose.set('strictQuery', false);
mongoose.connect(process.env.MONGOOSE_URL)


passport.serializeUser(function(user, done) {
    done(null, user);
});

passport.deserializeUser(function(user, done) {
        done(null, user);
});

const strategy = new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret:process.env.GOOGLE_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK,
    passReqToCallback   : true
},
function(request, accessToken, refreshToken, params, profile, done) {
    const expiry_date = moment().add(params.expires_in, "s").format("X");
    
    console.log( expiry_date )
    const user = {
        email: profile.emails[0].value,
        accessToken: accessToken,
        refreshToken: refreshToken,
        expiry_date: expiry_date
    }
    
    return done(null, user);
}
)

passport.use(strategy);
refresh.use(strategy);

var app = express();

app.use(cookieSession({
    name: 'google-auth-session',
    keys: ['eman', 'monkey']
}))

// register regenerate & save after the cookieSession middleware initialization
app.use(function(request, response, next) {
    if (request.session && !request.session.regenerate) {
        request.session.regenerate = (cb) => {
            cb()
        }
    }
    if (request.session && !request.session.save) {
        request.session.save = (cb) => {
            cb()
        }
    }
    next()
})

  
app.use(passport.initialize());
app.use(passport.session());

app.use(logger('dev'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.raw());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));


app.get('/google/login',
  passport.authenticate('google', {
          scope: ['email', 'profile', 'https://www.googleapis.com/auth/drive'],
            accessType: 'offline',
            prompt: 'consent',
            //prompt: 'select_account',
      }
  ));
app.get('/google/callback',
  passport.authenticate('google', {
      failureRedirect: '/failed',
  }),
  function (req, res) {
    console.log(req.session)
    console.log(`CHECKIN TO ${req.session.returnTo}`)
    res.redirect(req.session.returnTo || '/');
    delete req.session.returnTo;

  }
);
app.get("/google/logout", (req, res) => {
req.user = undefined
  req.logout(function(err) {
    if (err) { return next(err); }
    res.redirect('/');
  });
})
app.get('/miro/callback', async (req, res) => {
    let code
    try{
        const id = req?.session?.passport?.user?.email
        console.log(req.session)
        console.log(id)
        await miro.exchangeCodeForAccessToken(id, req.query.code)
        code = await miro.getAccessToken(id )
        console.log(code)

    }catch(error){
        console.log(error)
    }
    res.redirect("/miro/catch/?code=" + encodeURIComponent(code))
  })


var checkToken = async (req, res, next) => {
    // check for user
    if (!req.user ){
        return next();
    }
    if (!req.user.refreshToken ){
        console.log(`no token`)
        console.log(req.user)
      res.redirect('/google/logout')
      return
    }
    let user = req.user

    if (moment().subtract(user.expiry_date, "s").format("X") > -300) {
        console.log(`NEED TO REFRESH with ${user.refreshToken}`)

        await refresh.requestNewAccessToken('google', user.refreshToken, function(err, accessToken, refreshToken) {
            if (err || !accessToken){
                console.log(err)
                return next(err);
            } 
            req.user.accessToken = accessToken
            req.user.expiry_date = moment().add( 1000 * 60 * 60 * 24 * 7).format("X")
            next();
          });
    }else{
        next()
    }
  };
  
app.use(checkToken);

app.get('/api/status', (req, res) => {
    if (req.user) {
        res.status(200).json( {
            logged_in: true, 
            user: req.user,
            env:{
                OPEN_API_KEY:process.env.OPEN_API_KEY,
                GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
                GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
                MIRO_CLIENT_ID: process.env.MIRO_CLIENT_ID,
                MIRO_CLIENT_SECRET: process.env.MIRO_CLIENT_SECRET,
                MIRO_REDIRECT_URL: process.env.MIRO_REDIRECT_URL,
                PROXYCURL_KEY: process.env.PROXYCURL_KEY
            }            
        })
    } else {
        res.status(200).json( {logged_in: false})
    }
})

var ensureAuthenticated = async function(req, res, next) {
    if (req.isAuthenticated()){
        let user = await User.find({email: req.user.email})
        if( user ){
            return next();
        }
        req.session.returnTo = req.originalUrl; 
        console.log("redir A")
        res.redirect('/')
    } 
    else{
        req.session.returnTo = req.originalUrl; 
        console.log("redir B")
        res.redirect('/')
    }
}

app.use(ensureAuthenticated);
app.use('/api', apiRouter);

app.get("/google/failed", (req, res) => {
  res.send("Failed")
})

app.get('/miro/catch', async (req, res) => {
    console.log( req.query.code )
    if( req.user ){
        req.user.miro = req.query.code
    }
    res.redirect('/')
    
})

app.get('/miro/login', async (req, res) => {
    const id = req?.session?.passport?.user?.email
    console.log(id)
    if( !id){
        res.redirect('/')
        return
    }
    if (!(await miro.isAuthorized(id))) {
        res.redirect(miro.getAuthUrl())
        return
      }
})


app.get('/api/refresh', async (req, res) => {
    let user = req.user
    await refresh.requestNewAccessToken('google', user.refreshToken, function(err, accessToken, refreshToken) {
        if (err || !accessToken){
            console.log(err)
            res.status(403).json( {
                error: req.err,
            })
            return next(err);
        } 
        req.user.accessToken = accessToken
        console.log(req.user.accessToken)
        console.log(accessToken)
        req.user.expiry_date = moment().add( 1000 * 60 * 60 * 24 * 7).format("X")
        
        res.status(200).json( {
            user: req.user,
        })
    });
})

if (process.env.NODE_ENV === 'production') {
    app.use(express.static('ui/build'))
  
    const path = require('path')
    app.get('*', function(req, res) {
        console.log("HELLO THERE")
      res.sendFile(path.resolve('dist-server', 'ui', 'build', 'index.html'))
      //res.sendFile(path.resolve(__dirname, 'ui', 'build', 'index.html'))
    })
  }


export default app;