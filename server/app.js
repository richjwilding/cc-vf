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
import { setRefreshTokenHandler } from './google_helper';
import { google } from "googleapis";
import { SIO } from './socket';

import QueueAI from './ai_queue';

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
setRefreshTokenHandler(refresh)

var app = express();

const session = cookieSession({
    name: 'google-auth-session',
    keys: ['eman', 'monkey']
})

app.use(session)

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
    res.redirect('/');

  }
);
app.get("/google/logout", (req, res) => {
req.user = undefined
console.log("do logout")
  req.logout(function(err) {
    if (err) { 
        console.log(err)
        return next(err);
    }
console.log("done - redirect")
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

        const doRefresh = async () => {
            await refresh.requestNewAccessToken('google', user.refreshToken, function(err, accessToken, refreshToken) {
                if (err || !accessToken){
                    console.log(err)
                    return next(err);
                } 
                req.user.accessToken = accessToken
                req.user.expiry_date = moment().add( 1000 * 60 * 60 * 24 * 7).format("X")
                next();
            });
        }
        try{
            await doRefresh()
        }catch(error){
            try{
                await doRefresh()
            }catch(error){
                console.log(`Error refreshing`)        
                    console.log(error)
                next();
            }
        }

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
             //   OPEN_API_KEY:process.env.OPEN_API_KEY,
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
    if( ['/login', '/manifest.json', '/logo192.png'].includes(req?.originalUrl) ){
        return next()
    }
    if( req.originalUrl?.slice(0,12) === '/static/css/' ){
        return next()
    }
    if( req.originalUrl?.slice(0,11) === '/static/js/' ){
        return next()
    }
    if( req.originalUrl?.slice(0,8) === '/images/' ){
        return next()
    }
    if (req.isAuthenticated()){
        
        let user = await User.find({email: req.user.email})
        if( user && user.length > 0){
            return next();
        }else{
            try{
                const auth = new google.auth.OAuth2();
                auth.setCredentials({ access_token: req.user.accessToken });

                const papi = google.people({version: 'v1', auth})
                const data = await papi.people.get({
                    resourceName: 'people/me',
                    personFields: 'emailAddresses,names,photos'})
                if( data.data ){

                    const userInfo = {
                        name: data.data.names ? data.data.names[0].displayName : "Unknown",
                        avatarUrl: data.data.photos ? data.data.photos[0].url : undefined,
                        email: req.user.email,
                        //accessToken: req.user.accessToken
                    }
                    let query = {email: req.user.email};
                    let options = {upsert: true, new: true, setDefaultsOnInsert: true};
                    let user = await User.findOneAndUpdate(query, userInfo, options);

                }
            }catch(err){
                console.log(err)
            }
            return next();
        }
    } 
    else{
        res.redirect('/login')
    }
}

SIO.setAuthentication(session)

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
    try{

    await refresh.requestNewAccessToken('google', user.refreshToken, function(err, accessToken, refreshToken) {
        if (err || !accessToken){
            console.log(err)
            res.status(403).json( {
                error: req.err,
            })
            return
        } 
        req.user.accessToken = accessToken
        console.log(req.user.accessToken)
        console.log(accessToken)
        req.user.expiry_date = moment().add( 1000 * 60 * 60 * 24 * 7).format("X")
        
        res.status(200).json( {
            user: req.user,
        })
    });
    }catch(err){
        console.log(err)
        res.status(403).json( {
            error: "COULDNT REFRESH TOKEN",
        })
    }
})


if (process.env.NODE_ENV === 'production') {
    app.use(express.static('ui/build',{
        etag: false,
        setHeaders: (res, path) => {
            if (express.static.mime.lookup(path) === 'text/html') {
            res.setHeader('Cache-Control', 'public, max-age=0');
            }
        }

    }))
  
    const path = require('path')
    app.get('*', function(req, res) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
      res.sendFile(path.resolve('dist-server', 'ui', 'build', 'index.html'), { etag: false})
    })
  }
  


export default app;