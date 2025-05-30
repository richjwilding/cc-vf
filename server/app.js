import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import indexRouter from './routes/index';
import apiRouter from './routes/api';
import publishedRouter from './routes/published';
import passport from 'passport';
import cookieSession from 'cookie-session';
import bodyParser from 'body-parser'
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
import { updateBrightDataWhitelist } from './brightdata';

dotenv.config()

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

updateBrightDataWhitelist()

const session = cookieSession({
    name: 'google-auth-session',
    keys: ['eman', 'monkey']
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

/*var ensureAuthenticated = async function(req, res, next) {
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
    if (req.isAuthenticated()) {
        if (!req.session.user) {
            console.log(`LOADING USER FROM DATABASE`)
            // Load user data from the database
            const user = await User.findOne({ email: req.user.email });

            if (user) {
                req.session.user = {
                    email: user.email,
                    workspaceIds: user.workspaces,
                    name: user.name,
                    avatarUrl: user.avatarUrl,
                };
            } else {
                try {
                    const auth = new google.auth.OAuth2();
                    auth.setCredentials({ access_token: req.user.accessToken });

                    const papi = google.people({ version: 'v1', auth });
                    const data = await papi.people.get({
                        resourceName: 'people/me',
                        personFields: 'emailAddresses,names,photos',
                    });

                    if (data.data) {
                        const userInfo = {
                            name: data.data.names ? data.data.names[0].displayName : "Unknown",
                            avatarUrl: data.data.photos ? data.data.photos[0].url : undefined,
                            email: req.user.email,
                        };

                        const query = { email: req.user.email };
                        const options = { upsert: true, new: true, setDefaultsOnInsert: true };
                        const user = await User.findOneAndUpdate(query, userInfo, options);

                        req.session.user = {
                            email: user.email,
                            workspaceIds: user.workspaces,
                            name: user.name,
                            avatarUrl: user.avatarUrl,
                        };
                    }
                } catch (err) {
                    console.error(err);
                }
            }
        }else{
            console.log(`REUSING USER FROM SESSION`)

        }

        // Attach session user data to the request
        req.user = req.session.user;
        return next();
    }else{
        res.redirect('/login')
    }
}*/

const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

var ensureAuthenticated = async function (req, res, next) {
    const publicUrls = ['/login', '/manifest.json', '/logo192.png'];
    const staticPrefixes = ['/static/css/', '/static/js/', '/images/'];

    // Skip authentication for public URLs
    if (publicUrls.includes(req?.originalUrl) || staticPrefixes.some(prefix => req.originalUrl.startsWith(prefix))) {
        return next();
    }

    

    if (req.isAuthenticated()) {
        // Check if user data is already cached in the session
        if (req.session.user) {
            const now = Date.now();

            // Check if cached user data is still valid
            if (now - req.session.user.lastFetched < CACHE_DURATION) {
                //req.user = req.session.user.data;
                req.user = {...req.user,...req.session.user.data}
                return next();
            }
        }

        // If no cached data or cache expired, fetch fresh user data
        try {
            const user = await User.findOne({ email: req.user.email });

            if (user) {
                // Cache user data in the session with a timestamp
                req.session.user = {
                    data: {
                        email: user.email,
                        workspaceIds: user.workspaces,
                        name: user.name,
                        avatarUrl: user.avatarUrl,
                    },
                    lastFetched: Date.now(),
                };

                req.user = {...req.user,...req.session.user.data}
                return next();
            } else {
                res.redirect('/login');
            }
        } catch (err) {
            console.error('Error fetching user:', err);
            res.redirect('/login');
        }
    } else {
        if (req.path.startsWith('/api/image')) {
            const id = req.path.slice(11)
            const prim = await fetchPrimitive( id, {published: true}, {_id: 1, published: 1})
            if( prim ){
                return next(); // skip auth for this path
            }
        }
        res.redirect('/login');
    }
};

SIO.setAuthentication(session)

app.use(ensureAuthenticated);
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