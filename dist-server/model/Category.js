"use strict";Object.defineProperty(exports, "__esModule", { value: true });exports["default"] = void 0;var _mongoose = _interopRequireDefault(require("mongoose"));function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { "default": obj };}
var Schema = _mongoose["default"].Schema,model = _mongoose["default"].model;

var categorySchema = new Schema({
  "title": String,
  "description": String,
  "icon": String,
  "parameters": Schema.Types.Mixed
}, { strict: false });
var Category = model('Category', categorySchema);var _default =
Category;exports["default"] = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbW9uZ29vc2UiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIm9iaiIsIl9fZXNNb2R1bGUiLCJTY2hlbWEiLCJtb25nb29zZSIsIm1vZGVsIiwiY2F0ZWdvcnlTY2hlbWEiLCJTdHJpbmciLCJUeXBlcyIsIk1peGVkIiwic3RyaWN0IiwiQ2F0ZWdvcnkiLCJfZGVmYXVsdCIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvbW9kZWwvQ2F0ZWdvcnkuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IG1vbmdvb3NlIGZyb20gJ21vbmdvb3NlJztcbmNvbnN0IHsgU2NoZW1hLCBtb2RlbCB9ID0gbW9uZ29vc2U7XG5cbmNvbnN0IGNhdGVnb3J5U2NoZW1hID0gbmV3IFNjaGVtYSh7XG4gICAgXCJ0aXRsZVwiOiBTdHJpbmcsXG4gICAgXCJkZXNjcmlwdGlvblwiOiBTdHJpbmcsXG4gICAgXCJpY29uXCI6IFN0cmluZyxcbiAgICBcInBhcmFtZXRlcnNcIjogU2NoZW1hLlR5cGVzLk1peGVkXG59LHtzdHJpY3Q6IGZhbHNlfSk7XG5jb25zdCBDYXRlZ29yeSA9IG1vZGVsKCdDYXRlZ29yeScsIGNhdGVnb3J5U2NoZW1hKTtcbmV4cG9ydCBkZWZhdWx0IENhdGVnb3J5OyJdLCJtYXBwaW5ncyI6InVHQUFBLElBQUFBLFNBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQSxjQUFnQyxTQUFBRCx1QkFBQUUsR0FBQSxVQUFBQSxHQUFBLElBQUFBLEdBQUEsQ0FBQUMsVUFBQSxHQUFBRCxHQUFBLGdCQUFBQSxHQUFBO0FBQ2hDLElBQVFFLE1BQU0sR0FBWUMsb0JBQVEsQ0FBMUJELE1BQU0sQ0FBRUUsS0FBSyxHQUFLRCxvQkFBUSxDQUFsQkMsS0FBSzs7QUFFckIsSUFBTUMsY0FBYyxHQUFHLElBQUlILE1BQU0sQ0FBQztFQUM5QixPQUFPLEVBQUVJLE1BQU07RUFDZixhQUFhLEVBQUVBLE1BQU07RUFDckIsTUFBTSxFQUFFQSxNQUFNO0VBQ2QsWUFBWSxFQUFFSixNQUFNLENBQUNLLEtBQUssQ0FBQ0M7QUFDL0IsQ0FBQyxFQUFDLEVBQUNDLE1BQU0sRUFBRSxLQUFLLEVBQUMsQ0FBQztBQUNsQixJQUFNQyxRQUFRLEdBQUdOLEtBQUssQ0FBQyxVQUFVLEVBQUVDLGNBQWMsQ0FBQyxDQUFDLElBQUFNLFFBQUE7QUFDcENELFFBQVEsQ0FBQUUsT0FBQSxjQUFBRCxRQUFBIn0=