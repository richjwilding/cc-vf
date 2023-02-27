"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
var _mongoose = _interopRequireDefault(require("mongoose"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }
var Schema = _mongoose["default"].Schema,
  model = _mongoose["default"].model;
var categorySchema = new Schema({
  "title": String,
  "description": String,
  "icon": String,
  "parameters": Schema.Types.Mixed
});
var Category = model('Category', categorySchema);
var _default = Category;
exports["default"] = _default;