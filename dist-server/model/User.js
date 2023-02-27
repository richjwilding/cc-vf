"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
var _mongoose = _interopRequireDefault(require("mongoose"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }
var Schema = _mongoose["default"].Schema,
  model = _mongoose["default"].model;
var userSchema = new Schema({
  "name": String,
  "email": String,
  "avatarUrl": String
});
var User = model('User', userSchema);
var _default = User;
exports["default"] = _default;