"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
var _mongoose = _interopRequireDefault(require("mongoose"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }
var Schema = _mongoose["default"].Schema,
  model = _mongoose["default"].model;
var primitiveSchema = new Schema({
  "type": String,
  "state": String,
  "referenceId": Number,
  "resources": Schema.Types.Mixed,
  "primitives": Schema.Types.Mixed,
  "metrics": Schema.Types.Mixed,
  "refereceParameters": Schema.Types.Mixed,
  "users": Schema.Types.Mixed,
  "title": String,
  comments: [{
    user: {
      type: _mongoose["default"].Schema.Types.ObjectId,
      ref: 'User'
    },
    date: Date,
    body: String
  }]
}, {
  strict: false
});
var Primitive = model('Primitive', primitiveSchema);
var _default = Primitive;
exports["default"] = _default;