"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
var _mongoose = _interopRequireDefault(require("mongoose"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }
var Schema = _mongoose["default"].Schema,
  model = _mongoose["default"].model;
var contactSchema = new Schema({
  "name": String,
  "profile": String,
  "avatarUrl": String,
  "expertise": [String],
  "domains": [String]
});
var Contact = model('Contact', contactSchema);
var _default = Contact;
exports["default"] = _default;