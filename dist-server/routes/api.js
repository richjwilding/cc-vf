"use strict";

function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;
var _express = _interopRequireDefault(require("express"));
var _mongoose = _interopRequireDefault(require("mongoose"));
var _User = _interopRequireDefault(require("../model/User"));
var _Company = _interopRequireDefault(require("../model/Company"));
var _Contact = _interopRequireDefault(require("../model/Contact"));
var _Category = _interopRequireDefault(require("../model/Category"));
var _Primitive = _interopRequireDefault(require("../model/Primitive"));
var _PrimitivesParser = _interopRequireDefault(require("../PrimitivesParser"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { "default": obj }; }
function _createForOfIteratorHelper(o, allowArrayLike) { var it = typeof Symbol !== "undefined" && o[Symbol.iterator] || o["@@iterator"]; if (!it) { if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === "number") { if (it) o = it; var i = 0; var F = function F() {}; return { s: F, n: function n() { if (i >= o.length) return { done: true }; return { done: false, value: o[i++] }; }, e: function e(_e) { throw _e; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var normalCompletion = true, didErr = false, err; return { s: function s() { it = it.call(o); }, n: function n() { var step = it.next(); normalCompletion = step.done; return step; }, e: function e(_e2) { didErr = true; err = _e2; }, f: function f() { try { if (!normalCompletion && it["return"] != null) it["return"](); } finally { if (didErr) throw err; } } }; }
function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }
function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i]; return arr2; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
function _regeneratorRuntime() { "use strict"; /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/facebook/regenerator/blob/main/LICENSE */ _regeneratorRuntime = function _regeneratorRuntime() { return exports; }; var exports = {}, Op = Object.prototype, hasOwn = Op.hasOwnProperty, defineProperty = Object.defineProperty || function (obj, key, desc) { obj[key] = desc.value; }, $Symbol = "function" == typeof Symbol ? Symbol : {}, iteratorSymbol = $Symbol.iterator || "@@iterator", asyncIteratorSymbol = $Symbol.asyncIterator || "@@asyncIterator", toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag"; function define(obj, key, value) { return Object.defineProperty(obj, key, { value: value, enumerable: !0, configurable: !0, writable: !0 }), obj[key]; } try { define({}, ""); } catch (err) { define = function define(obj, key, value) { return obj[key] = value; }; } function wrap(innerFn, outerFn, self, tryLocsList) { var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator, generator = Object.create(protoGenerator.prototype), context = new Context(tryLocsList || []); return defineProperty(generator, "_invoke", { value: makeInvokeMethod(innerFn, self, context) }), generator; } function tryCatch(fn, obj, arg) { try { return { type: "normal", arg: fn.call(obj, arg) }; } catch (err) { return { type: "throw", arg: err }; } } exports.wrap = wrap; var ContinueSentinel = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} var IteratorPrototype = {}; define(IteratorPrototype, iteratorSymbol, function () { return this; }); var getProto = Object.getPrototypeOf, NativeIteratorPrototype = getProto && getProto(getProto(values([]))); NativeIteratorPrototype && NativeIteratorPrototype !== Op && hasOwn.call(NativeIteratorPrototype, iteratorSymbol) && (IteratorPrototype = NativeIteratorPrototype); var Gp = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(IteratorPrototype); function defineIteratorMethods(prototype) { ["next", "throw", "return"].forEach(function (method) { define(prototype, method, function (arg) { return this._invoke(method, arg); }); }); } function AsyncIterator(generator, PromiseImpl) { function invoke(method, arg, resolve, reject) { var record = tryCatch(generator[method], generator, arg); if ("throw" !== record.type) { var result = record.arg, value = result.value; return value && "object" == _typeof(value) && hasOwn.call(value, "__await") ? PromiseImpl.resolve(value.__await).then(function (value) { invoke("next", value, resolve, reject); }, function (err) { invoke("throw", err, resolve, reject); }) : PromiseImpl.resolve(value).then(function (unwrapped) { result.value = unwrapped, resolve(result); }, function (error) { return invoke("throw", error, resolve, reject); }); } reject(record.arg); } var previousPromise; defineProperty(this, "_invoke", { value: function value(method, arg) { function callInvokeWithMethodAndArg() { return new PromiseImpl(function (resolve, reject) { invoke(method, arg, resolve, reject); }); } return previousPromise = previousPromise ? previousPromise.then(callInvokeWithMethodAndArg, callInvokeWithMethodAndArg) : callInvokeWithMethodAndArg(); } }); } function makeInvokeMethod(innerFn, self, context) { var state = "suspendedStart"; return function (method, arg) { if ("executing" === state) throw new Error("Generator is already running"); if ("completed" === state) { if ("throw" === method) throw arg; return doneResult(); } for (context.method = method, context.arg = arg;;) { var delegate = context.delegate; if (delegate) { var delegateResult = maybeInvokeDelegate(delegate, context); if (delegateResult) { if (delegateResult === ContinueSentinel) continue; return delegateResult; } } if ("next" === context.method) context.sent = context._sent = context.arg;else if ("throw" === context.method) { if ("suspendedStart" === state) throw state = "completed", context.arg; context.dispatchException(context.arg); } else "return" === context.method && context.abrupt("return", context.arg); state = "executing"; var record = tryCatch(innerFn, self, context); if ("normal" === record.type) { if (state = context.done ? "completed" : "suspendedYield", record.arg === ContinueSentinel) continue; return { value: record.arg, done: context.done }; } "throw" === record.type && (state = "completed", context.method = "throw", context.arg = record.arg); } }; } function maybeInvokeDelegate(delegate, context) { var methodName = context.method, method = delegate.iterator[methodName]; if (undefined === method) return context.delegate = null, "throw" === methodName && delegate.iterator["return"] && (context.method = "return", context.arg = undefined, maybeInvokeDelegate(delegate, context), "throw" === context.method) || "return" !== methodName && (context.method = "throw", context.arg = new TypeError("The iterator does not provide a '" + methodName + "' method")), ContinueSentinel; var record = tryCatch(method, delegate.iterator, context.arg); if ("throw" === record.type) return context.method = "throw", context.arg = record.arg, context.delegate = null, ContinueSentinel; var info = record.arg; return info ? info.done ? (context[delegate.resultName] = info.value, context.next = delegate.nextLoc, "return" !== context.method && (context.method = "next", context.arg = undefined), context.delegate = null, ContinueSentinel) : info : (context.method = "throw", context.arg = new TypeError("iterator result is not an object"), context.delegate = null, ContinueSentinel); } function pushTryEntry(locs) { var entry = { tryLoc: locs[0] }; 1 in locs && (entry.catchLoc = locs[1]), 2 in locs && (entry.finallyLoc = locs[2], entry.afterLoc = locs[3]), this.tryEntries.push(entry); } function resetTryEntry(entry) { var record = entry.completion || {}; record.type = "normal", delete record.arg, entry.completion = record; } function Context(tryLocsList) { this.tryEntries = [{ tryLoc: "root" }], tryLocsList.forEach(pushTryEntry, this), this.reset(!0); } function values(iterable) { if (iterable) { var iteratorMethod = iterable[iteratorSymbol]; if (iteratorMethod) return iteratorMethod.call(iterable); if ("function" == typeof iterable.next) return iterable; if (!isNaN(iterable.length)) { var i = -1, next = function next() { for (; ++i < iterable.length;) if (hasOwn.call(iterable, i)) return next.value = iterable[i], next.done = !1, next; return next.value = undefined, next.done = !0, next; }; return next.next = next; } } return { next: doneResult }; } function doneResult() { return { value: undefined, done: !0 }; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, defineProperty(Gp, "constructor", { value: GeneratorFunctionPrototype, configurable: !0 }), defineProperty(GeneratorFunctionPrototype, "constructor", { value: GeneratorFunction, configurable: !0 }), GeneratorFunction.displayName = define(GeneratorFunctionPrototype, toStringTagSymbol, "GeneratorFunction"), exports.isGeneratorFunction = function (genFun) { var ctor = "function" == typeof genFun && genFun.constructor; return !!ctor && (ctor === GeneratorFunction || "GeneratorFunction" === (ctor.displayName || ctor.name)); }, exports.mark = function (genFun) { return Object.setPrototypeOf ? Object.setPrototypeOf(genFun, GeneratorFunctionPrototype) : (genFun.__proto__ = GeneratorFunctionPrototype, define(genFun, toStringTagSymbol, "GeneratorFunction")), genFun.prototype = Object.create(Gp), genFun; }, exports.awrap = function (arg) { return { __await: arg }; }, defineIteratorMethods(AsyncIterator.prototype), define(AsyncIterator.prototype, asyncIteratorSymbol, function () { return this; }), exports.AsyncIterator = AsyncIterator, exports.async = function (innerFn, outerFn, self, tryLocsList, PromiseImpl) { void 0 === PromiseImpl && (PromiseImpl = Promise); var iter = new AsyncIterator(wrap(innerFn, outerFn, self, tryLocsList), PromiseImpl); return exports.isGeneratorFunction(outerFn) ? iter : iter.next().then(function (result) { return result.done ? result.value : iter.next(); }); }, defineIteratorMethods(Gp), define(Gp, toStringTagSymbol, "Generator"), define(Gp, iteratorSymbol, function () { return this; }), define(Gp, "toString", function () { return "[object Generator]"; }), exports.keys = function (val) { var object = Object(val), keys = []; for (var key in object) keys.push(key); return keys.reverse(), function next() { for (; keys.length;) { var key = keys.pop(); if (key in object) return next.value = key, next.done = !1, next; } return next.done = !0, next; }; }, exports.values = values, Context.prototype = { constructor: Context, reset: function reset(skipTempReset) { if (this.prev = 0, this.next = 0, this.sent = this._sent = undefined, this.done = !1, this.delegate = null, this.method = "next", this.arg = undefined, this.tryEntries.forEach(resetTryEntry), !skipTempReset) for (var name in this) "t" === name.charAt(0) && hasOwn.call(this, name) && !isNaN(+name.slice(1)) && (this[name] = undefined); }, stop: function stop() { this.done = !0; var rootRecord = this.tryEntries[0].completion; if ("throw" === rootRecord.type) throw rootRecord.arg; return this.rval; }, dispatchException: function dispatchException(exception) { if (this.done) throw exception; var context = this; function handle(loc, caught) { return record.type = "throw", record.arg = exception, context.next = loc, caught && (context.method = "next", context.arg = undefined), !!caught; } for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i], record = entry.completion; if ("root" === entry.tryLoc) return handle("end"); if (entry.tryLoc <= this.prev) { var hasCatch = hasOwn.call(entry, "catchLoc"), hasFinally = hasOwn.call(entry, "finallyLoc"); if (hasCatch && hasFinally) { if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0); if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc); } else if (hasCatch) { if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0); } else { if (!hasFinally) throw new Error("try statement without catch or finally"); if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc); } } } }, abrupt: function abrupt(type, arg) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.tryLoc <= this.prev && hasOwn.call(entry, "finallyLoc") && this.prev < entry.finallyLoc) { var finallyEntry = entry; break; } } finallyEntry && ("break" === type || "continue" === type) && finallyEntry.tryLoc <= arg && arg <= finallyEntry.finallyLoc && (finallyEntry = null); var record = finallyEntry ? finallyEntry.completion : {}; return record.type = type, record.arg = arg, finallyEntry ? (this.method = "next", this.next = finallyEntry.finallyLoc, ContinueSentinel) : this.complete(record); }, complete: function complete(record, afterLoc) { if ("throw" === record.type) throw record.arg; return "break" === record.type || "continue" === record.type ? this.next = record.arg : "return" === record.type ? (this.rval = this.arg = record.arg, this.method = "return", this.next = "end") : "normal" === record.type && afterLoc && (this.next = afterLoc), ContinueSentinel; }, finish: function finish(finallyLoc) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.finallyLoc === finallyLoc) return this.complete(entry.completion, entry.afterLoc), resetTryEntry(entry), ContinueSentinel; } }, "catch": function _catch(tryLoc) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.tryLoc === tryLoc) { var record = entry.completion; if ("throw" === record.type) { var thrown = record.arg; resetTryEntry(entry); } return thrown; } } throw new Error("illegal catch attempt"); }, delegateYield: function delegateYield(iterable, resultName, nextLoc) { return this.delegate = { iterator: values(iterable), resultName: resultName, nextLoc: nextLoc }, "next" === this.method && (this.arg = undefined), ContinueSentinel; } }, exports; }
function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }
function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }
var ObjectId = require('mongoose').Types.ObjectId;
var parser = (0, _PrimitivesParser["default"])();
var router = _express["default"].Router();
router.get('/', /*#__PURE__*/function () {
  var _ref = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee(req, res, next) {
    return _regeneratorRuntime().wrap(function _callee$(_context) {
      while (1) switch (_context.prev = _context.next) {
        case 0:
          res.json({
            up: true
          });
        case 1:
        case "end":
          return _context.stop();
      }
    }, _callee);
  }));
  return function (_x, _x2, _x3) {
    return _ref.apply(this, arguments);
  };
}());
router.get('/users', /*#__PURE__*/function () {
  var _ref2 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee2(req, res, next) {
    var results;
    return _regeneratorRuntime().wrap(function _callee2$(_context2) {
      while (1) switch (_context2.prev = _context2.next) {
        case 0:
          _context2.prev = 0;
          _context2.next = 3;
          return _User["default"].find({});
        case 3:
          results = _context2.sent;
          res.json(results);
          _context2.next = 10;
          break;
        case 7:
          _context2.prev = 7;
          _context2.t0 = _context2["catch"](0);
          res.json({
            error: _context2.t0
          });
        case 10:
        case "end":
          return _context2.stop();
      }
    }, _callee2, null, [[0, 7]]);
  }));
  return function (_x4, _x5, _x6) {
    return _ref2.apply(this, arguments);
  };
}());
router.get('/companies', /*#__PURE__*/function () {
  var _ref3 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee3(req, res, next) {
    var results;
    return _regeneratorRuntime().wrap(function _callee3$(_context3) {
      while (1) switch (_context3.prev = _context3.next) {
        case 0:
          _context3.prev = 0;
          _context3.next = 3;
          return _Company["default"].find({});
        case 3:
          results = _context3.sent;
          res.json(results);
          _context3.next = 10;
          break;
        case 7:
          _context3.prev = 7;
          _context3.t0 = _context3["catch"](0);
          res.json({
            error: _context3.t0
          });
        case 10:
        case "end":
          return _context3.stop();
      }
    }, _callee3, null, [[0, 7]]);
  }));
  return function (_x7, _x8, _x9) {
    return _ref3.apply(this, arguments);
  };
}());
router.get('/contacts', /*#__PURE__*/function () {
  var _ref4 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee4(req, res, next) {
    var results;
    return _regeneratorRuntime().wrap(function _callee4$(_context4) {
      while (1) switch (_context4.prev = _context4.next) {
        case 0:
          _context4.prev = 0;
          _context4.next = 3;
          return _Contact["default"].find({});
        case 3:
          results = _context4.sent;
          res.json(results);
          _context4.next = 10;
          break;
        case 7:
          _context4.prev = 7;
          _context4.t0 = _context4["catch"](0);
          res.json({
            error: _context4.t0
          });
        case 10:
        case "end":
          return _context4.stop();
      }
    }, _callee4, null, [[0, 7]]);
  }));
  return function (_x10, _x11, _x12) {
    return _ref4.apply(this, arguments);
  };
}());
router.get('/categories', /*#__PURE__*/function () {
  var _ref5 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee5(req, res, next) {
    var results;
    return _regeneratorRuntime().wrap(function _callee5$(_context5) {
      while (1) switch (_context5.prev = _context5.next) {
        case 0:
          _context5.prev = 0;
          _context5.next = 3;
          return _Category["default"].find({});
        case 3:
          results = _context5.sent;
          res.json(results);
          _context5.next = 10;
          break;
        case 7:
          _context5.prev = 7;
          _context5.t0 = _context5["catch"](0);
          res.json({
            error: _context5.t0
          });
        case 10:
        case "end":
          return _context5.stop();
      }
    }, _callee5, null, [[0, 7]]);
  }));
  return function (_x13, _x14, _x15) {
    return _ref5.apply(this, arguments);
  };
}());
router.get('/primitives', /*#__PURE__*/function () {
  var _ref6 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee6(req, res, next) {
    var results;
    return _regeneratorRuntime().wrap(function _callee6$(_context6) {
      while (1) switch (_context6.prev = _context6.next) {
        case 0:
          _context6.prev = 0;
          _context6.next = 3;
          return _Primitive["default"].find({});
        case 3:
          results = _context6.sent;
          res.json(results);
          _context6.next = 10;
          break;
        case 7:
          _context6.prev = 7;
          _context6.t0 = _context6["catch"](0);
          res.json({
            error: _context6.t0
          });
        case 10:
        case "end":
          return _context6.stop();
      }
    }, _callee6, null, [[0, 7]]);
  }));
  return function (_x16, _x17, _x18) {
    return _ref6.apply(this, arguments);
  };
}());
router.post('/set_field', /*#__PURE__*/function () {
  var _ref7 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee7(req, res, next) {
    var data;
    return _regeneratorRuntime().wrap(function _callee7$(_context7) {
      while (1) switch (_context7.prev = _context7.next) {
        case 0:
          data = req.body;
          try {
            _Primitive["default"].findOneAndUpdate({
              "_id": new ObjectId(data.receiver)
            }, {
              $set: _defineProperty({}, data.field, data.value)
            }, {
              "new": true
            }, function (err, doc) {});
            res.json({
              success: true
            });
          } catch (err) {
            res.json(400, {
              error: err.message
            });
          }
        case 2:
        case "end":
          return _context7.stop();
      }
    }, _callee7);
  }));
  return function (_x19, _x20, _x21) {
    return _ref7.apply(this, arguments);
  };
}());
router.post('/move_relationship', /*#__PURE__*/function () {
  var _ref8 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee8(req, res, next) {
    var data, _Primitive$findOneAnd, fromPath, toPath;
    return _regeneratorRuntime().wrap(function _callee8$(_context8) {
      while (1) switch (_context8.prev = _context8.next) {
        case 0:
          data = req.body;
          _context8.prev = 1;
          fromPath = flattenPath(data.from);
          toPath = flattenPath(data.to);
          _context8.prev = 4;
          _context8.next = 7;
          return _Primitive["default"].findOneAndUpdate({
            "_id": new ObjectId(data.target)
          }, [{
            $set: _defineProperty({}, "parentPrimitives.".concat(data.receiver), {
              $function: {
                body: "function(arr){ arr = (arr || []).filter((p)=>(p != '".concat(fromPath, "') && (p != '").concat(toPath, "') ); arr.push('").concat(toPath, "'); return arr }"),
                args: ["$parentPrimitives.".concat(data.receiver)],
                lang: "js"
              }
            })
          }]);
        case 7:
          _context8.next = 12;
          break;
        case 9:
          _context8.prev = 9;
          _context8.t0 = _context8["catch"](4);
          throw new Error(_context8.t0);
        case 12:
          _context8.next = 14;
          return _Primitive["default"].findOneAndUpdate((_Primitive$findOneAnd = {
            "_id": new ObjectId(data.receiver)
          }, _defineProperty(_Primitive$findOneAnd, fromPath, {
            $in: [data.target]
          }), _defineProperty(_Primitive$findOneAnd, toPath, {
            $nin: [data.target]
          }), _Primitive$findOneAnd), {
            $pull: _defineProperty({}, fromPath, data.target),
            $push: _defineProperty({}, toPath, data.target)
          });
        case 14:
          _context8.next = 19;
          break;
        case 16:
          _context8.prev = 16;
          _context8.t1 = _context8["catch"](1);
          res.json(400, {
            error: _context8.t1.message
          });
        case 19:
        case "end":
          return _context8.stop();
      }
    }, _callee8, null, [[1, 16], [4, 9]]);
  }));
  return function (_x22, _x23, _x24) {
    return _ref8.apply(this, arguments);
  };
}());
router.post('/add_contact', /*#__PURE__*/function () {
  var _ref9 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee9(req, res, next) {
    var data, newPrimitive, newId;
    return _regeneratorRuntime().wrap(function _callee9$(_context9) {
      while (1) switch (_context9.prev = _context9.next) {
        case 0:
          data = req.body;
          console.log(data);
          _context9.prev = 2;
          _context9.next = 5;
          return _Contact["default"].create(data.data);
        case 5:
          newPrimitive = _context9.sent;
          newId = newPrimitive._id.toString();
          res.json({
            success: true,
            id: newId
          });
          _context9.next = 13;
          break;
        case 10:
          _context9.prev = 10;
          _context9.t0 = _context9["catch"](2);
          res.json(400, {
            error: _context9.t0.message
          });
        case 13:
        case "end":
          return _context9.stop();
      }
    }, _callee9, null, [[2, 10]]);
  }));
  return function (_x25, _x26, _x27) {
    return _ref9.apply(this, arguments);
  };
}());
var removeParentReference = /*#__PURE__*/function () {
  var _ref10 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee10(target, parentId) {
    var targetId, updates;
    return _regeneratorRuntime().wrap(function _callee10$(_context10) {
      while (1) switch (_context10.prev = _context10.next) {
        case 0:
          if (target instanceof Object) {
            _context10.next = 4;
            break;
          }
          _context10.next = 3;
          return _Primitive["default"].findOne({
            "_id": new ObjectId(target)
          });
        case 3:
          target = _context10.sent;
        case 4:
          targetId = target.id;
          _context10.prev = 5;
          updates = target.parentPrimitives[parentId].reduce(function (o, pp) {
            o[pp] = {
              $function: {
                body: "function(arr){ return arr ? arr.filter((p)=>p != '".concat(target.id, "') : undefined;}"),
                args: ["$".concat(pp)],
                lang: "js"
              }
            };
            return o;
          }, {});
          _context10.next = 9;
          return _Primitive["default"].findOneAndUpdate({
            "_id": new ObjectId(parentId)
          }, [{
            $set: updates
          }]);
        case 9:
          _context10.next = 14;
          break;
        case 11:
          _context10.prev = 11;
          _context10.t0 = _context10["catch"](5);
          throw _context10.t0;
        case 14:
        case "end":
          return _context10.stop();
      }
    }, _callee10, null, [[5, 11]]);
  }));
  return function removeParentReference(_x28, _x29) {
    return _ref10.apply(this, arguments);
  };
}();
router.post('/remove_primitive', /*#__PURE__*/function () {
  var _ref11 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee11(req, res, next) {
    var data, removed, _i, _Object$keys, parentId, childPrimitiveIds, _iterator, _step, childId;
    return _regeneratorRuntime().wrap(function _callee11$(_context11) {
      while (1) switch (_context11.prev = _context11.next) {
        case 0:
          data = req.body;
          _context11.prev = 1;
          _context11.next = 4;
          return _Primitive["default"].findOneAndDelete({
            "_id": new ObjectId(data.id)
          });
        case 4:
          removed = _context11.sent;
          //const removed = await Primitive.findOne({"_id": new ObjectId(data.id)})
          console.log(removed);
          _context11.prev = 6;
          if (!removed.parentPrimitives) {
            _context11.next = 18;
            break;
          }
          console.log("remove parents = ");
          console.log(removed.parentPrimitives);
          _i = 0, _Object$keys = Object.keys(removed.parentPrimitives);
        case 11:
          if (!(_i < _Object$keys.length)) {
            _context11.next = 18;
            break;
          }
          parentId = _Object$keys[_i];
          _context11.next = 15;
          return removeParentReference(removed, parentId);
        case 15:
          _i++;
          _context11.next = 11;
          break;
        case 18:
          console.log(removed.primitives);
          if (!removed.primitives) {
            _context11.next = 41;
            break;
          }
          childPrimitiveIds = new Proxy(removed.primitives, parser).uniqueAllIds;
          console.log("remove child refs = ");
          console.log(childPrimitiveIds);
          _iterator = _createForOfIteratorHelper(childPrimitiveIds);
          _context11.prev = 24;
          _iterator.s();
        case 26:
          if ((_step = _iterator.n()).done) {
            _context11.next = 33;
            break;
          }
          childId = _step.value;
          console.log(childId);
          _context11.next = 31;
          return _Primitive["default"].findOneAndUpdate({
            "_id": new ObjectId(childId)
          }, {
            $unset: _defineProperty({}, "parentPrimitives.".concat(removed.id), "")
          });
        case 31:
          _context11.next = 26;
          break;
        case 33:
          _context11.next = 38;
          break;
        case 35:
          _context11.prev = 35;
          _context11.t0 = _context11["catch"](24);
          _iterator.e(_context11.t0);
        case 38:
          _context11.prev = 38;
          _iterator.f();
          return _context11.finish(38);
        case 41:
          _context11.next = 46;
          break;
        case 43:
          _context11.prev = 43;
          _context11.t1 = _context11["catch"](6);
          throw _context11.t1;
        case 46:
          res.json({
            success: true
          });
          _context11.next = 52;
          break;
        case 49:
          _context11.prev = 49;
          _context11.t2 = _context11["catch"](1);
          res.status(400).json({
            error: _context11.t2.message
          });
        case 52:
        case "end":
          return _context11.stop();
      }
    }, _callee11, null, [[1, 49], [6, 43], [24, 35, 38, 41]]);
  }));
  return function (_x30, _x31, _x32) {
    return _ref11.apply(this, arguments);
  };
}());
router.post('/add_primitive', /*#__PURE__*/function () {
  var _ref12 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee12(req, res, next) {
    var data, paths, newPrimitive, newId, _iterator2, _step2, path;
    return _regeneratorRuntime().wrap(function _callee12$(_context12) {
      while (1) switch (_context12.prev = _context12.next) {
        case 0:
          data = req.body;
          console.log(data);
          _context12.prev = 2;
          paths = data.paths.map(function (p) {
            return flattenPath(p);
          });
          console.log(paths);
          data.data.parentPrimitives = _defineProperty({}, data.parent, paths);
          _context12.next = 8;
          return _Primitive["default"].create(data.data);
        case 8:
          newPrimitive = _context12.sent;
          newId = newPrimitive._id.toString();
          _context12.prev = 10;
          _iterator2 = _createForOfIteratorHelper(paths);
          _context12.prev = 12;
          _iterator2.s();
        case 14:
          if ((_step2 = _iterator2.n()).done) {
            _context12.next = 21;
            break;
          }
          path = _step2.value;
          console.log(path);
          _context12.next = 19;
          return _Primitive["default"].findOneAndUpdate({
            "_id": new ObjectId(data.parent)
          }, {
            $push: _defineProperty({}, path, newId)
          });
        case 19:
          _context12.next = 14;
          break;
        case 21:
          _context12.next = 26;
          break;
        case 23:
          _context12.prev = 23;
          _context12.t0 = _context12["catch"](12);
          _iterator2.e(_context12.t0);
        case 26:
          _context12.prev = 26;
          _iterator2.f();
          return _context12.finish(26);
        case 29:
          _context12.next = 34;
          break;
        case 31:
          _context12.prev = 31;
          _context12.t1 = _context12["catch"](10);
          throw _context12.t1;
        case 34:
          res.json({
            success: true,
            id: newId
          });
          _context12.next = 40;
          break;
        case 37:
          _context12.prev = 37;
          _context12.t2 = _context12["catch"](2);
          res.status(400).json({
            error: _context12.t2.message
          });
        case 40:
        case "end":
          return _context12.stop();
      }
    }, _callee12, null, [[2, 37], [10, 31], [12, 23, 26, 29]]);
  }));
  return function (_x33, _x34, _x35) {
    return _ref12.apply(this, arguments);
  };
}());
var flattenPath = function flattenPath(path) {
  var out = ['primitives'];
  var nest = function nest(node) {
    if (node instanceof Object) {
      var k = Object.keys(node)[0];
      out.push(k);
      nest(node[k]);
      return out;
    }
    out.push(node);
    return out;
  };
  return nest(path).join(".");
};
router.post('/set_relationship', /*#__PURE__*/function () {
  var _ref13 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee14(req, res, next) {
    var data, doRemove, path, parentPath, check;
    return _regeneratorRuntime().wrap(function _callee14$(_context14) {
      while (1) switch (_context14.prev = _context14.next) {
        case 0:
          data = req.body;
          console.log(data);
          doRemove = /*#__PURE__*/function () {
            var _ref14 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee13(path) {
              return _regeneratorRuntime().wrap(function _callee13$(_context13) {
                while (1) switch (_context13.prev = _context13.next) {
                  case 0:
                    _context13.next = 2;
                    return _Primitive["default"].findOneAndUpdate(_defineProperty({
                      "_id": new ObjectId(data.receiver)
                    }, path, {
                      $in: [data.target]
                    }), {
                      $pull: _defineProperty({}, path, data.target)
                    }, {
                      "new": true
                    });
                  case 2:
                  case "end":
                    return _context13.stop();
                }
              }, _callee13);
            }));
            return function doRemove(_x39) {
              return _ref14.apply(this, arguments);
            };
          }();
          _context14.prev = 3;
          path = flattenPath(data.path);
          parentPath = "parentPrimitives.".concat(data.receiver);
          if (!data.set) {
            _context14.next = 25;
            break;
          }
          _context14.prev = 7;
          _context14.next = 10;
          return _Primitive["default"].findOneAndUpdate(_defineProperty({
            "_id": new ObjectId(data.target)
          }, parentPath, {
            $nin: [path]
          }), {
            $push: _defineProperty({}, parentPath, path)
          });
        case 10:
          _context14.next = 15;
          break;
        case 12:
          _context14.prev = 12;
          _context14.t0 = _context14["catch"](7);
          throw new Error("Couldn't find target");
        case 15:
          _context14.next = 17;
          return _Primitive["default"].findOneAndUpdate(_defineProperty({
            "_id": new ObjectId(data.receiver)
          }, path, {
            $nin: [data.target]
          }), {
            $push: _defineProperty({}, path, data.target)
          });
        case 17:
          _context14.next = 19;
          return _Primitive["default"].find({
            "_id": new ObjectId(data.target)
          });
        case 19:
          check = _context14.sent;
          if (!(check.length === 0)) {
            _context14.next = 23;
            break;
          }
          doRemove(path);
          throw new Error("Couldn't find target");
        case 23:
          _context14.next = 34;
          break;
        case 25:
          _context14.prev = 25;
          _context14.next = 28;
          return _Primitive["default"].findOneAndUpdate(_defineProperty({
            "_id": new ObjectId(data.target)
          }, parentPath, {
            $in: [path]
          }), {
            $pull: _defineProperty({}, parentPath, path)
          });
        case 28:
          _context14.next = 33;
          break;
        case 30:
          _context14.prev = 30;
          _context14.t1 = _context14["catch"](25);
          throw new Error("Couldn't find target");
        case 33:
          doRemove(path);
        case 34:
          res.json({
            success: true
          });
          _context14.next = 40;
          break;
        case 37:
          _context14.prev = 37;
          _context14.t2 = _context14["catch"](3);
          res.status(400).json({
            error: _context14.t2.message
          });
        case 40:
        case "end":
          return _context14.stop();
      }
    }, _callee14, null, [[3, 37], [7, 12], [25, 30]]);
  }));
  return function (_x36, _x37, _x38) {
    return _ref13.apply(this, arguments);
  };
}());
var _default = router;
exports["default"] = _default;