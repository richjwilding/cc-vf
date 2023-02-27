"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
var _mongoose = _interopRequireDefault(require("mongoose"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }
var Schema = _mongoose["default"].Schema,
  model = _mongoose["default"].model;
var companySchema = new Schema({
  "name": String,
  "logoUrl": String,
  "employees": Number,
  "turnover": Schema.Types.Mixed,
  "sector": [String],
  "region": [String]
});
var Company = model('Company', companySchema);
var _default = Company;
exports["default"] = _default;