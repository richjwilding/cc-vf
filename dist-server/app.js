"use strict";

function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
var _express = _interopRequireDefault(require("express"));
var _path2 = _interopRequireDefault(require("path"));
var _cookieParser = _interopRequireDefault(require("cookie-parser"));
var _morgan = _interopRequireDefault(require("morgan"));
var _index = _interopRequireDefault(require("./routes/index"));
var _api = _interopRequireDefault(require("./routes/api"));
var _passport = _interopRequireDefault(require("passport"));
var _cookieSession = _interopRequireDefault(require("cookie-session"));
var _bodyParser = _interopRequireDefault(require("body-parser"));
var _passportGoogleOauth = require("passport-google-oauth20");
var dotenv = _interopRequireWildcard(require("dotenv"));
var _mongoose = _interopRequireDefault(require("mongoose"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function _getRequireWildcardCache(nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || _typeof(obj) !== "object" && typeof obj !== "function") { return { "default": obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj["default"] = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }
dotenv.config();
_mongoose["default"].set('strictQuery', false);
_mongoose["default"].connect("mongodb://127.0.0.1:27017/?directConnection=true&serverSelectionTimeoutMS=2000&appName=mongosh+1.7.1");
_passport["default"].serializeUser(function (user, done) {
  done(null, user);
});
_passport["default"].deserializeUser(function (user, done) {
  done(null, user);
});
console.log("hello ".concat(process.env.GOOGLE_CLIENT_ID));
_passport["default"].use(new _passportGoogleOauth.Strategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK,
  passReqToCallback: true
}, function (request, accessToken, refreshToken, profile, done) {
  return done(null, profile);
}));
var app = (0, _express["default"])();
app.use((0, _cookieSession["default"])({
  name: 'google-auth-session',
  keys: ['eman', 'monkey']
}));

// register regenerate & save after the cookieSession middleware initialization
app.use(function (request, response, next) {
  if (request.session && !request.session.regenerate) {
    request.session.regenerate = function (cb) {
      cb();
    };
  }
  if (request.session && !request.session.save) {
    request.session.save = function (cb) {
      cb();
    };
  }
  next();
});
app.use(_passport["default"].initialize());
app.use(_passport["default"].session());
app.use((0, _morgan["default"])('dev'));
app.use(_bodyParser["default"].urlencoded({
  extended: true
}));
app.use(_bodyParser["default"].json());
app.use(_bodyParser["default"].raw());
app.use(_express["default"].json());
app.use(_express["default"].urlencoded({
  extended: false
}));
app.use((0, _cookieParser["default"])());
app.use(_express["default"]["static"](_path2["default"].join(__dirname, '../public')));
app.get('/api/status', function (req, res) {
  if (req.user) {
    res.status(200).json({
      logged_in: true
    });
  } else {
    res.status(200).json({
      logged_in: false
    });
  }
});
app.get('/google/login', _passport["default"].authenticate('google', {
  scope: ['email', 'profile']
}));
app.get('/google/callback', _passport["default"].authenticate('google', {
  failureRedirect: '/failed'
}), function (req, res) {
  res.redirect('/');
});
var ensureAuthenticated = function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    if (['rich@co-created.com', 'jason@co-created.com', 'daniel@co-created.com', 'stacey@co-created.com', 'ron@co-created.com'].includes(req.user.emails[0].value)) {
      return next();
    }
    res.redirect('/google/login');
  } else {
    res.redirect('/google/login');
  }
};
app.use(ensureAuthenticated);
app.use('/api', _api["default"]);
app.get("/google/failed", function (req, res) {
  res.send("Failed");
});
app.get("/google/logout", function (req, res) {
  // req.session = null;
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect('/google/login');
  });
});
if (process.env.NODE_ENV === 'production') {
  app.use(_express["default"]["static"]('ui/build'));
  var _path = require('path');
  app.get('*', function (req, res) {
    res.sendFile(_path.resolve(__dirname, 'ui', 'build', 'index.html'));
  });
}
var _default = app;
exports["default"] = _default;