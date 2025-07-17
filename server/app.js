import express from 'express';
import compression from 'compression';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import indexRouter from './routes/index';
import apiRouter from './routes/api';
import publishedRouter from './routes/published';
import authRouter from './routes/auth';
import passport from 'passport';
import cookieSession from 'cookie-session';
import bodyParser from 'body-parser'
import { Strategy as LocalStrategy } from 'passport-local'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import * as dotenv from 'dotenv' 
import mongoose from 'mongoose';
import User from './model/User';
import moment from 'moment';
import * as refresh from 'passport-oauth2-refresh';
import { setRefreshTokenHandler } from './google_helper';
import { google } from "googleapis";
import { SIO } from './socket';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { fetchPrimitive } from './SharedFunctions';
import { body, validationResult } from 'express-validator'
import { updateBrightDataWhitelist } from './brightdata';
import NodeCache from 'node-cache'
import Organization from './model/Organization';


export const userCache = new NodeCache({ stdTTL: 300, checkperiod: 60 })

export async function fetchUserProfile(userId) {
    if( !userId){
        return
    }
    if( typeof(userId) === "object"){
        return
    }
    const cached = userCache.get(userId)
    if (cached) {
      return cached
    }
  
    const userDoc = await User.findById(userId).lean()
    if (!userDoc) {
      throw new Error(`User not found: ${userId}`)
    }
  
    const profile = {
      _id: userDoc._id.toString(),
      email: userDoc.email,
      name: userDoc.name,
      avatarUrl: userDoc.avatarUrl,
      workspaceIds: userDoc.workspaces,  
      accessToken:  userDoc.accessToken,
        refreshToken: userDoc.refreshToken,
        expiry_date:  userDoc.expiry_date,
    }
  
    userCache.set(userId, profile)
  
    return profile
  }

dotenv.config()

mongoose.set('strictQuery', false);
mongoose.connect(process.env.MONGOOSE_URL)


passport.serializeUser((user, done) => {
    done(null, user._id.toString())
  })
  
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await fetchUserProfile(id)
      if (!user) {
        return done(null, false);
      }
      // Pass the entire user object into `req.user`
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  });

  passport.use(new LocalStrategy({ usernameField: 'email' }, User.authenticate()));
  

const strategy = new GoogleStrategy(
    {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret:process.env.GOOGLE_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK,
        passReqToCallback   : true
    },
    async function (req, accessToken, refreshToken, params, profile, done) {
        try {
            const email = profile.emails[0].value.toLowerCase().trim()
            let user = await User.findOne({ email })
    
          if (!user) {
            const oauth2Client = new google.auth.OAuth2()
            oauth2Client.setCredentials({ access_token: accessToken })
            const peopleApi = google.people({ version: 'v1', auth: oauth2Client })
            const me = await peopleApi.people.get({
              resourceName: 'people/me',
              personFields: 'emailAddresses,names,photos',
            })
    
            const userInfo = {
              googleId: profile.id,
              email:   profile.emails[0].value,
              name:    me.data.names?.[0]?.displayName || profile.displayName,
              avatarUrl: me.data.photos?.[0]?.url || undefined,
              accessToken,
              refreshToken,
              expiry_date: moment().add(params.expires_in, 's').format('X'),
            }
    
            user = await User.findOneAndUpdate(
              { googleId: profile.id }, // either match on googleId ...
              userInfo,                 // ... fill in these fields
              { upsert: true, new: true, setDefaultsOnInsert: true }
            )
          } else {
            user.googleId = profile.id
            user.accessToken  = accessToken
            user.refreshToken = refreshToken
            user.expiry_date  = moment().add(params.expires_in, 's').format('X')
            await user.save()
          }
    
          return done(null, user)
        } catch (err) {
          console.error('Error in GoogleStrategy callback:', err)
          return done(err, null)
        }
      }
)

passport.use(strategy);
refresh.use(strategy);
setRefreshTokenHandler(refresh)

var app = express();

updateBrightDataWhitelist()

const session = cookieSession({
    name: 'google-auth-session',
    keys: ['eman', 'monkey'],
    maxAge: 7 * 24 * 60 * 60 * 1000, // 24h
})

app.use(session)
app.use(express.json({ limit: "50mb" }));

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

app.use((req, res, next) => {
    if (req.url.endsWith('.wasm')) {
      res.setHeader('Content-Type', 'application/wasm');
    }
    next();
  });

  app.use(express.static(path.join(__dirname, '../public')));


app.use('/published', publishedRouter);
app.use('/auth', authRouter);

if (process.env.NODE_ENV !== 'production') {
    app.use(
      '/published',
      createProxyMiddleware({
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      })
    );
  }


app.get('/google/login',
  passport.authenticate('google', {
          scope: ['email', 'profile', 'https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/adwords'],
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
app.get("/logout", (req, res) => {
    req.user = undefined
    req.logout(function(err) {
        if (err) { 
            console.log(err)
            return next(err);
        }
        console.log("done - redirect")
        res.redirect('/');
    });
})


var checkToken = async (req, res, next) => {
    // check for user
    if (!req.user ){
        return next();
    }
    if (!req.user.googleId ){
        return next();
    }
    if (!req.user.refreshToken ){
        console.log(`no token`)
      res.redirect('/logout')
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
  

app.get('/api/status', (req, res) => {
    if (req.user) {
        res.status(200).json( {
            logged_in: true, 
            user: req.user
        })
    } else {
        res.status(200).json( {logged_in: false})
    }
})

var ensureAuthenticated = async function (req, res, next) {
    const publicUrls = ['/login', '/signup', '/manifest.json', '/logo192.png'];
    const staticPrefixes = ['/auth','/static/css/', '/static/js/', '/images/'];
  
    if (
      publicUrls.includes(req.originalUrl) ||
      staticPrefixes.some((p) => req.originalUrl.startsWith(p))
    ) {
      return next();
    }
  
    if (!req.isAuthenticated() || !req.user || !req.user._id) {
      if (req.path.startsWith('/api/image')) {
        const id = req.path.slice(11);
        const prim = await fetchPrimitive(id, { published: true }, { _id: 1, published: 1 });
        if (prim) return next();
      }
      return res.redirect('/login');
    }
  
    try {
      const fullProfile = await fetchUserProfile(req.user._id);
      req.user = fullProfile;
      return next();
    } catch (err) {
      console.error('Error fetching user profile:', err);
      return next(err);
    }
  }

SIO.setAuthentication(session)

app.use(checkToken)  
app.use(ensureAuthenticated);
app.use(
    '/api',
    compression({
      threshold: 102400,
      filter: (req, res) => {
        const acceptHeader = req.headers.accept || '';
        if (acceptHeader.includes('text/event-stream')) {
            return false;
        }

        if (req.path.endsWith('/agent')) {
            return false;
        }

        const contentType = res.getHeader('Content-Type') || '';
        
        if (contentType.includes('application/msgpack')) {
          return true;
        }
        return compression.filter(req, res);
      }
    })
  );

app.use('/api', apiRouter);

app.get("/google/failed", (req, res) => {
  res.send("Failed")
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
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
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