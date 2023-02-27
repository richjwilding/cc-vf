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
dotenv.config()


mongoose.set('strictQuery', false);
mongoose.connect("mongodb://127.0.0.1:27017/?directConnection=true&serverSelectionTimeoutMS=2000&appName=mongosh+1.7.1")

passport.serializeUser(function(user, done) {
    done(null, user);
});

passport.deserializeUser(function(user, done) {
        done(null, user);
});

console.log(`hello ${process.env.GOOGLE_CLIENT_ID}`)

passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret:process.env.GOOGLE_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK,
        passReqToCallback   : true
    },
    function(request, accessToken, refreshToken, profile, done) {
            return done(null, profile);
    }
));

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

app.get('/api/status', (req, res) => {
    if (req.user) {
        res.status(200).json( {logged_in: true})
    } else {
        res.status(200).json( {logged_in: false})
    }
})

app.get('/google/login',
  passport.authenticate('google', {
          scope:
              ['email', 'profile']
      }
  ));
app.get('/google/callback',
  passport.authenticate('google', {
      failureRedirect: '/failed',
  }),
  function (req, res) {
      res.redirect('/')

  }
);


var ensureAuthenticated = function(req, res, next) {
    if (req.isAuthenticated()){
        if( [ 'rich@co-created.com','jason@co-created.com','daniel@co-created.com','stacey@co-created.com','ron@co-created.com'].includes( req.user.emails[0].value) ){
            return next();
        }
        res.redirect('/google/login')
    } 
    else{
        res.redirect('/google/login')
    }
}

app.use(ensureAuthenticated);
app.use('/api', apiRouter);

app.get("/google/failed", (req, res) => {
  res.send("Failed")
})



app.get("/google/logout", (req, res) => {
 // req.session = null;
  req.logout(function(err) {
    if (err) { return next(err); }
    res.redirect('/google/login');
  });
})

if (process.env.NODE_ENV === 'production') {
    app.use(express.static('ui/build'))
  
    const path = require('path')
    app.get('*', function(req, res) {
      res.sendFile(path.resolve(__dirname, 'ui', 'build', 'index.html'))
    })
  }

export default app;