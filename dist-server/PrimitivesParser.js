"use strict";Object.defineProperty(exports, "__esModule", { value: true });exports["default"] = PrimitiveParser;function _typeof(obj) {"@babel/helpers - typeof";return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) {return typeof obj;} : function (obj) {return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;}, _typeof(obj);}function _defineProperty(obj, key, value) {key = _toPropertyKey(key);if (key in obj) {Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true });} else {obj[key] = value;}return obj;}function _toPropertyKey(arg) {var key = _toPrimitive(arg, "string");return _typeof(key) === "symbol" ? key : String(key);}function _toPrimitive(input, hint) {if (_typeof(input) !== "object" || input === null) return input;var prim = input[Symbol.toPrimitive];if (prim !== undefined) {var res = prim.call(input, hint || "default");if (_typeof(res) !== "object") return res;throw new TypeError("@@toPrimitive must return a primitive value.");}return (hint === "string" ? String : Number)(input);}function PrimitiveParser(obj) {
  var uniqueArray = function uniqueArray(a) {
    return a.filter(function (v, i) {return a.indexOf(v) === i;});
  };
  var structure = {
    get: function get(target, prop, receiver) {
      if (prop === "add") {
        return function () {
          var item = arguments[0];
          if (arguments[1]) {
            var path = receiver.fromPath(arguments[1], true);

            if (!path) {
              console.warn("Path not found");
              console.log(path);
              return undefined;
            }
            return path.add(item);
          }
          if (!(target instanceof Array)) {
            if (!(null in target)) {
              target[null] = [];
            }
            target = target["null"];
          }
          target.push(item);
          return receiver;
        };
      }
      if (prop === "remove") {
        return function () {
          var item = arguments[0];
          if (arguments[1]) {
            var path = receiver.fromPath(arguments[1]);

            if (!path) {
              console.warn("Path not found");
              console.log(path);
              return undefined;
            }
            return path.remove(item);
          }
          if (!(target instanceof Array)) {
            target = target["null"];
          }
          var idx = target.findIndex(function (i) {return i === item;});
          while (idx > -1) {
            target.splice(idx, 1);
            idx = target.findIndex(function (i) {return i === item;});
          }

          return receiver;
        };
      }
      if (prop === "move") {
        return function () {
          var item = arguments[0];
          var from = receiver.fromPath(arguments[1]);
          var to = receiver.fromPath(arguments[2], true);
          if (from && to) {
            from.remove(item);
          }
          if (to) {
            to.add(item);
          }
          return to;
        };
      }

      if (prop === "includes") {
        return function () {
          var value = arguments[0];
          var find = function find(v) {
            return Object.values(v).reduce(function (r, d) {
              if (d instanceof Object) {
                return r || find(d);
              } else {
                return r || d === value;
              }
            }, false);
          };
          return find(target);
        };
      }
      if (prop === "paths") {
        return function () {
          var id = arguments[0];
          var find = function find(v, path) {
            var out = [];
            if (v instanceof Array) {
              if (v.includes(id)) {
                out.push(path);
              }
              v.filter(function (d) {return d instanceof Object;}).forEach(function (d) {
                out.push(Object.keys(d).map(function (k) {
                  return find(d[k], path + "." + k);
                }));
              });
            } else {
              out.push(Object.keys(v).map(function (k) {
                return find(v[k], path + "." + k);
              }));
            }
            out = out.flat(2).filter(function (d) {return d !== undefined;});
            return out.length > 0 ? out : undefined;
          };
          var result = find(target, "");
          if (arguments.length == 2) {
            var str = arguments[1] instanceof Array ? ".".concat(arguments[1].join('.'), ".") : arguments[1];
            var len = str.length;
            result = result.filter(function (p) {return p.slice(0, len) === str;});
          }
          if (result) {
            result = result.map(function (p) {return p.replace(/^\.null/, "");});
          }
          return result;
        };
      }
      if (prop === "relationships") {
        return function () {
          var path = receiver.paths.apply(receiver, arguments);
          return path === null || path === void 0 ? void 0 : path.map(function (p) {return p.split('.').slice(-1)[0];});
        };
      }

      if (prop === "all") {
        return target;
      }
      if (prop === "ids" && target instanceof Array) {
        return target.map(function (d) {
          if (d instanceof Object) {
            return undefined;
          } else {
            return d;
          }}).filter(function (d) {return d;});
      }
      if (prop === "uniqueIds" && target instanceof Array) {
        return uniqueArray(receiver.ids);
      }

      if (prop === "allIds") {
        var flatten = function flatten(v) {
          return Object.values(v).map(function (d) {
            if (d instanceof Object) {
              return flatten(d);
            } else {
              return d;
            }
          }).flat();
        };
        return flatten(target);
      }
      if (prop === "uniqueAllIds") {
        return uniqueArray(receiver.allIds);
      }
      if (prop === "filter" || prop === "length" || prop === "map") {
        var base = receiver.allItems;
        var value = base[prop];
        if (value instanceof Function) {
          return function () {for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {args[_key] = arguments[_key];}
            return value.apply(base, args);
          };
        }
      }
      if (Array.isArray(target)) {
        var out;
        target.forEach(function (d) {
          if (d instanceof Object) {
            if (prop in d) {
              out = d[prop];
            }
          }
        });
        if (out) {
          return new Proxy(out, structure);
        }
        if (prop in target) {
          var _value = target[prop];
          if (_value instanceof Function) {
            return function () {for (var _len2 = arguments.length, args = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {args[_key2] = arguments[_key2];}
              return _value.apply(this === receiver ? target : this, args);
            };
          }
          if (_value instanceof Object) {
            return new Proxy(_value, structure);
          }
          return _value;
        }
      }
      if (prop in target) {
        return new Proxy(target[prop], structure);
      } else {
        var s = prop.toString();
        if (s in target) {
          return new Proxy(target[s], structure);
        }
      }
      if (prop === "underlying") {
        return target;
      }
      if (prop === "fromPath") {
        return function (path) {var create = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
          var node = receiver;
          if (typeof path === "string") {
            path = path.split('.');
            var last = path.pop();
            if (path.length === 0) {
              path = last;
            } else {

              path = path.reverse().reduce(function (o, c, idx) {
                return _defineProperty({}, c, idx === 0 ? last : o);
              }, {});
            }
          }

          var addNode = function addNode(last, step, prevLast, prevStep) {
            var underlying = last.underlying;
            console.log("adding ".concat(step));
            if (Array.isArray(underlying)) {
              if (underlying.length === 0 && prevLast) {
                if (Array.isArray(prevLast)) {
                  var arr = prevLast.underlying.find(function (d) {return Object.keys(d)[0] == prevStep;});
                  if (arr) {
                    arr[prevStep] = {};
                  }
                } else {
                  prevLast.underlying[prevStep] = {};
                }
                last = prevLast[prevStep];
                underlying = last.underlying;
                underlying[step] = [];
              } else {
                underlying.push(_defineProperty({}, step, []));
              }
            } else {
              underlying[step] = [];
            }
            return last;
          };

          var prevLast;
          var prevStep;

          var needCreate = function needCreate(step, last) {
            var is_A = Array.isArray(last.underlying);
            return is_A && !last.underlying[step] && !last.underlying.find(function (d) {return Object.keys(d).includes(step);}) ||
            !is_A && last.underlying[step] === undefined;
          };

          while (path instanceof Object) {
            var step = Object.keys(path)[0];
            var _last = node;
            path = path[step];
            node = node[step];
            if (needCreate(step, _last)) {
              if (create) {
                _last = addNode(_last, step, prevLast, prevStep);
                node = _last[step];
              } else {
                return undefined;
              }
            }
            prevLast = _last;
            prevStep = step;
          }
          if (needCreate(path, node) && create) {
            node = addNode(node, path, prevLast, prevStep);
          }
          return node[path];

        };
      }
      if (obj) {
        // was here
        if (prop === "items") {
          return receiver.ids.map(function (d) {return obj.primitive(d);}).filter(function (d) {return d;});
        }
        if (prop === "allItems") {
          return receiver.allIds.map(function (d) {return obj.primitive(d);}).filter(function (d) {return d;});
        }
        if (prop === "uniqueAllItems") {
          return receiver.uniqueAllIds.map(function (d) {return obj.primitive(d);}).filter(function (d) {return d;});
        }
        if (prop === "uniqueItems") {
          return receiver.uniqueIds.map(function (d) {return obj.primitive(d);}).filter(function (d) {return d;});
        }
        if (obj.types.includes(prop)) {
          return receiver.items.filter(function (p) {return p.type === prop;});
        }
        if (prop.slice(0, 6) === 'unique') {
          var type = prop.slice(6).toLowerCase();
          if (obj.types.includes(type)) {
            return receiver.uniqueItems.filter(function (p) {return p.type === type;});
          }
        }
        if (prop.slice(0, 9) === 'allUnique') {
          var _type = prop.slice(9).toLowerCase();
          if (obj.types.includes(_type)) {
            return receiver.uniqueAllItems.filter(function (p) {return p.type === _type;});
          }
        }
        if (prop.slice(0, 3) === 'all') {
          var _type2 = prop.slice(3).toLowerCase();
          if (obj.types.includes(_type2)) {
            return receiver.allItems.filter(function (p) {return p.type === _type2;});
          }
        }
      }
      if (target[null]) {
        return new Proxy(target[null], structure)[prop];
      } else {
        return new Proxy([], structure);
      }
    }
  };
  return structure;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQcmltaXRpdmVQYXJzZXIiLCJvYmoiLCJ1bmlxdWVBcnJheSIsImEiLCJmaWx0ZXIiLCJ2IiwiaSIsImluZGV4T2YiLCJzdHJ1Y3R1cmUiLCJnZXQiLCJ0YXJnZXQiLCJwcm9wIiwicmVjZWl2ZXIiLCJpdGVtIiwiYXJndW1lbnRzIiwicGF0aCIsImZyb21QYXRoIiwiY29uc29sZSIsIndhcm4iLCJsb2ciLCJ1bmRlZmluZWQiLCJhZGQiLCJBcnJheSIsInB1c2giLCJyZW1vdmUiLCJpZHgiLCJmaW5kSW5kZXgiLCJzcGxpY2UiLCJmcm9tIiwidG8iLCJ2YWx1ZSIsImZpbmQiLCJPYmplY3QiLCJ2YWx1ZXMiLCJyZWR1Y2UiLCJyIiwiZCIsImlkIiwib3V0IiwiaW5jbHVkZXMiLCJmb3JFYWNoIiwia2V5cyIsIm1hcCIsImsiLCJmbGF0IiwibGVuZ3RoIiwicmVzdWx0Iiwic3RyIiwiY29uY2F0Iiwiam9pbiIsImxlbiIsInAiLCJzbGljZSIsInJlcGxhY2UiLCJwYXRocyIsImFwcGx5Iiwic3BsaXQiLCJpZHMiLCJmbGF0dGVuIiwiYWxsSWRzIiwiYmFzZSIsImFsbEl0ZW1zIiwiRnVuY3Rpb24iLCJfbGVuIiwiYXJncyIsIl9rZXkiLCJpc0FycmF5IiwiUHJveHkiLCJfbGVuMiIsIl9rZXkyIiwicyIsInRvU3RyaW5nIiwiY3JlYXRlIiwibm9kZSIsImxhc3QiLCJwb3AiLCJyZXZlcnNlIiwibyIsImMiLCJfZGVmaW5lUHJvcGVydHkiLCJhZGROb2RlIiwic3RlcCIsInByZXZMYXN0IiwicHJldlN0ZXAiLCJ1bmRlcmx5aW5nIiwiYXJyIiwibmVlZENyZWF0ZSIsImlzX0EiLCJwcmltaXRpdmUiLCJ1bmlxdWVBbGxJZHMiLCJ1bmlxdWVJZHMiLCJ0eXBlcyIsIml0ZW1zIiwidHlwZSIsInRvTG93ZXJDYXNlIiwidW5pcXVlSXRlbXMiLCJ1bmlxdWVBbGxJdGVtcyJdLCJzb3VyY2VzIjpbIi4uL3NlcnZlci9QcmltaXRpdmVzUGFyc2VyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIFByaW1pdGl2ZVBhcnNlcihvYmope1xuICAgIGNvbnN0IHVuaXF1ZUFycmF5ID0gKGEpPT57XG4gICAgICAgIHJldHVybiBhLmZpbHRlcigodixpKT0+YS5pbmRleE9mKHYpID09PSBpKVxuICAgIH1cbiAgICBjb25zdCBzdHJ1Y3R1cmUgPSB7XG4gICAgICAgICAgICBnZXQodGFyZ2V0LCBwcm9wLCByZWNlaXZlcikge1xuICAgICAgICAgICAgICAgIGlmKCBwcm9wID09PSBcImFkZFwiICl7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGl0ZW0gPSBhcmd1bWVudHNbMF1cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKCBhcmd1bWVudHNbMV0gKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXRoID0gcmVjZWl2ZXIuZnJvbVBhdGgoYXJndW1lbnRzWzFdLCB0cnVlKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKCAhcGF0aCl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgUGF0aCBub3QgZm91bmRgKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhwYXRoKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBwYXRoLmFkZChpdGVtKVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYoICEodGFyZ2V0IGluc3RhbmNlb2YgQXJyYXkpICl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYoICEobnVsbCBpbiB0YXJnZXQpICl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldFtudWxsXSA9IFtdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldCA9IHRhcmdldC5udWxsXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXQucHVzaCggaXRlbSApXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVjZWl2ZXIgXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYoIHByb3AgPT09IFwicmVtb3ZlXCIgKXtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgaXRlbSA9IGFyZ3VtZW50c1swXVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYoIGFyZ3VtZW50c1sxXSApe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHBhdGggPSByZWNlaXZlci5mcm9tUGF0aChhcmd1bWVudHNbMV0pXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYoICFwYXRoKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBQYXRoIG5vdCBmb3VuZGApXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKHBhdGgpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHBhdGgucmVtb3ZlKGl0ZW0pXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiggISh0YXJnZXQgaW5zdGFuY2VvZiBBcnJheSkgKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXQgPSB0YXJnZXQubnVsbFxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGlkeCA9IHRhcmdldC5maW5kSW5kZXgoKGkpPT4gaSA9PT0gaXRlbSApXG4gICAgICAgICAgICAgICAgICAgICAgICB3aGlsZShpZHggPiAtMSl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LnNwbGljZShpZHgsMSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZHggPSB0YXJnZXQuZmluZEluZGV4KChpKT0+IGkgPT09IGl0ZW0gKVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVjZWl2ZXIgXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYoIHByb3AgPT09IFwibW92ZVwiICl7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGl0ZW0gPSBhcmd1bWVudHNbMF1cbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBmcm9tID0gIHJlY2VpdmVyLmZyb21QYXRoKGFyZ3VtZW50c1sxXSlcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCB0byA9ICByZWNlaXZlci5mcm9tUGF0aChhcmd1bWVudHNbMl0sIHRydWUpXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiggZnJvbSAmJiB0byApe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZyb20ucmVtb3ZlKGl0ZW0pXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiggdG8gKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0by5hZGQoaXRlbSlcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0b1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYoIHByb3AgPT09IFwiaW5jbHVkZXNcIiApe1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCB2YWx1ZSA9IGFyZ3VtZW50c1swXVxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZmluZCA9ICh2KT0+e1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBPYmplY3QudmFsdWVzKHYpLnJlZHVjZSgociwgZCk9PntcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYoIGQgaW5zdGFuY2VvZihPYmplY3QpICl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gciB8fCBmaW5kKGQpIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByIHx8IChkID09PSB2YWx1ZSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sZmFsc2UpXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmluZCggdGFyZ2V0IClcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiggcHJvcCA9PT0gXCJwYXRoc1wiICl7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGlkID0gYXJndW1lbnRzWzBdXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmaW5kID0gKHYsIHBhdGgpPT57XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IG91dCA9IFtdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYoIHYgaW5zdGFuY2VvZihBcnJheSkgKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYoIHYuaW5jbHVkZXMoIGlkICkpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3V0LnB1c2goIHBhdGggKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHYuZmlsdGVyKChkKT0+ZCBpbnN0YW5jZW9mKE9iamVjdCkgKS5mb3JFYWNoKChkKT0+e1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3V0LnB1c2goIE9iamVjdC5rZXlzKGQpLm1hcCgoayk9PntcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmluZCggZFtrXSwgcGF0aCArIFwiLlwiICsgaylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvdXQucHVzaCggT2JqZWN0LmtleXModikubWFwKChrKT0+e1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZpbmQoIHZba10sIHBhdGggKyBcIi5cIiArIGspXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvdXQgPSBvdXQuZmxhdCgyKS5maWx0ZXIoKGQpPT5kICE9PSB1bmRlZmluZWQpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG91dC5sZW5ndGggPiAwID8gb3V0IDogdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgcmVzdWx0ID0gZmluZCggdGFyZ2V0LCBcIlwiIClcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKCBhcmd1bWVudHMubGVuZ3RoID09IDIpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCBzdHIgPSBhcmd1bWVudHNbMV0gaW5zdGFuY2VvZihBcnJheSkgPyBgLiR7YXJndW1lbnRzWzFdLmpvaW4oJy4nKX0uYCA6IGFyZ3VtZW50c1sxXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCBsZW4gPSBzdHIubGVuZ3RoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0ID0gcmVzdWx0LmZpbHRlcigocCk9PnAuc2xpY2UoMCwgbGVuKSA9PT0gc3RyKVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYoIHJlc3VsdCApe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3VsdCA9IHJlc3VsdC5tYXAoKHApPT5wLnJlcGxhY2UoL15cXC5udWxsLyxcIlwiKSlcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHRcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiggcHJvcCA9PT0gXCJyZWxhdGlvbnNoaXBzXCIpe1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBwYXRoID0gcmVjZWl2ZXIucGF0aHMoLi4uYXJndW1lbnRzKVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHBhdGg/Lm1hcCgocCk9PnAuc3BsaXQoJy4nKS5zbGljZSgtMSlbMF0pXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYoIHByb3AgPT09IFwiYWxsXCIpe1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGFyZ2V0XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmKCBwcm9wID09PSBcImlkc1wiICYmIHRhcmdldCBpbnN0YW5jZW9mKEFycmF5KSl7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0YXJnZXQubWFwKChkKT0+e1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYoIGQgaW5zdGFuY2VvZihPYmplY3QpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZFxuICAgICAgICAgICAgICAgICAgICAgICAgfX0pLmZpbHRlcigoZCk9PmQpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmKCBwcm9wID09PSBcInVuaXF1ZUlkc1wiICYmIHRhcmdldCBpbnN0YW5jZW9mKEFycmF5KSl7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB1bmlxdWVBcnJheSggcmVjZWl2ZXIuaWRzIClcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiggcHJvcCA9PT0gXCJhbGxJZHNcIil7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZsYXR0ZW4gPSAodik9PntcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBPYmplY3QudmFsdWVzKHYpLm1hcCgoZCk9PntcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiggZCBpbnN0YW5jZW9mKE9iamVjdCkgKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZsYXR0ZW4oZCkgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBkXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSkuZmxhdCgpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZsYXR0ZW4oIHRhcmdldCApXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmKCBwcm9wID09PSBcInVuaXF1ZUFsbElkc1wiKXtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHVuaXF1ZUFycmF5KCByZWNlaXZlci5hbGxJZHMgKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiggcHJvcCA9PT0gXCJmaWx0ZXJcIiB8fCBwcm9wID09PSBcImxlbmd0aFwiIHx8IHByb3AgPT09IFwibWFwXCIpe1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBiYXNlID0gcmVjZWl2ZXIuYWxsSXRlbXNcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBiYXNlW3Byb3BdO1xuICAgICAgICAgICAgICAgICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBGdW5jdGlvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uICguLi5hcmdzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLmFwcGx5KGJhc2UsIGFyZ3MpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiggQXJyYXkuaXNBcnJheSh0YXJnZXQpICl7XG4gICAgICAgICAgICAgICAgICAgIGxldCBvdXRcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LmZvckVhY2goKGQpPT57XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiggZCBpbnN0YW5jZW9mKE9iamVjdCkgKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiggcHJvcCBpbiBkKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3V0ID0gZFtwcm9wXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgaWYoIG91dCApe1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm94eShvdXQsIHN0cnVjdHVyZSlcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiggcHJvcCBpbiB0YXJnZXQgKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gdGFyZ2V0W3Byb3BdO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHZhbHVlIGluc3RhbmNlb2YgRnVuY3Rpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbiAoLi4uYXJncykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZS5hcHBseSh0aGlzID09PSByZWNlaXZlciA/IHRhcmdldCA6IHRoaXMsIGFyZ3MpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKCB2YWx1ZSBpbnN0YW5jZW9mIE9iamVjdCApe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBuZXcgUHJveHkodmFsdWUsIHN0cnVjdHVyZSlcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiggcHJvcCBpbiB0YXJnZXQgKXtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm94eSh0YXJnZXRbcHJvcF0sIHN0cnVjdHVyZSlcbiAgICAgICAgICAgICAgICB9ZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGxldCBzID0gcHJvcC50b1N0cmluZygpXG4gICAgICAgICAgICAgICAgICAgIGlmKCBzIGluIHRhcmdldCApe1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm94eSh0YXJnZXRbc10sIHN0cnVjdHVyZSlcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiggcHJvcCA9PT0gXCJ1bmRlcmx5aW5nXCIpe1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGFyZ2V0XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmKCBwcm9wID09PSBcImZyb21QYXRoXCIpe1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24ocGF0aCwgY3JlYXRlID0gZmFsc2Upe1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IG5vZGUgPSByZWNlaXZlciAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgaWYoIHR5cGVvZihwYXRoKSA9PT0gXCJzdHJpbmdcIil7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0aCA9IHBhdGguc3BsaXQoJy4nKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGxhc3QgPSBwYXRoLnBvcCgpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYoIHBhdGgubGVuZ3RoID09PSAwKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0aCA9IGxhc3RcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9ZWxzZXtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXRoID0gcGF0aC5yZXZlcnNlKCkucmVkdWNlKChvLCBjLCBpZHgpPT57XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1tjXTogaWR4ID09PSAwID8gbGFzdCA6IG99XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0se30pXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBhZGROb2RlID0gKCBsYXN0LCBzdGVwLCBwcmV2TGFzdCwgcHJldlN0ZXApPT57XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHVuZGVybHlpbmcgPSBsYXN0LnVuZGVybHlpbmdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgYWRkaW5nICR7c3RlcH1gKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKCBBcnJheS5pc0FycmF5KHVuZGVybHlpbmcgKSApe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiggdW5kZXJseWluZy5sZW5ndGggPT09IDAgJiYgcHJldkxhc3QgKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKCBBcnJheS5pc0FycmF5KHByZXZMYXN0KSApe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGFyciA9IHByZXZMYXN0LnVuZGVybHlpbmcuZmluZCgoZCk9Pk9iamVjdC5rZXlzKGQpWzBdID09IHByZXZTdGVwKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKCBhcnIgICl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFycltwcmV2U3RlcF0gPSB7fVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByZXZMYXN0LnVuZGVybHlpbmdbcHJldlN0ZXBdID0ge31cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxhc3QgPSBwcmV2TGFzdFtwcmV2U3RlcF1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVuZGVybHlpbmcgPSBsYXN0LnVuZGVybHlpbmdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVuZGVybHlpbmdbc3RlcF0gPSBbXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVuZGVybHlpbmcucHVzaCh7W3N0ZXBdOiBbXX0pXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdW5kZXJseWluZ1tzdGVwXSA9IFtdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBsYXN0XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBwcmV2TGFzdFxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHByZXZTdGVwXG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IG5lZWRDcmVhdGUgPSAoc3RlcCwgbGFzdCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzX0EgPSBBcnJheS5pc0FycmF5KGxhc3QudW5kZXJseWluZylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gKGlzX0EgJiYgIWxhc3QudW5kZXJseWluZ1tzdGVwXSAmJiAhbGFzdC51bmRlcmx5aW5nLmZpbmQoKGQpPT5PYmplY3Qua2V5cyhkKS5pbmNsdWRlcyhzdGVwKSkpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfHwgKCFpc19BICYmIGxhc3QudW5kZXJseWluZ1tzdGVwXSA9PT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICB3aGlsZSggcGF0aCBpbnN0YW5jZW9mKE9iamVjdCkgKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsZXQgc3RlcCA9IE9iamVjdC5rZXlzKHBhdGgpWzBdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGxhc3QgPSBub2RlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0aCA9IHBhdGhbc3RlcF1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlID0gbm9kZVtzdGVwXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKCBuZWVkQ3JlYXRlKHN0ZXAsIGxhc3QpICl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKCBjcmVhdGUgKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxhc3QgPSBhZGROb2RlKCBsYXN0LCBzdGVwLCBwcmV2TGFzdCwgcHJldlN0ZXApXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlID0gbGFzdFtzdGVwXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcmV2TGFzdCA9IGxhc3RcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcmV2U3RlcCA9IHN0ZXBcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKCBuZWVkQ3JlYXRlKHBhdGgsIG5vZGUpICYmIGNyZWF0ZSApe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGUgPSBhZGROb2RlKCBub2RlLCBwYXRoLCBwcmV2TGFzdCwgcHJldlN0ZXApXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gbm9kZVtwYXRoXVxuXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYoIG9iaiApe1xuICAgICAgICAgICAgICAgICAgICAvLyB3YXMgaGVyZVxuICAgICAgICAgICAgICAgICAgICBpZiggcHJvcCA9PT0gXCJpdGVtc1wiKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZWNlaXZlci5pZHMubWFwKChkKT0+b2JqLnByaW1pdGl2ZShkKSkuZmlsdGVyKChkKT0+ZClcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiggcHJvcCA9PT0gXCJhbGxJdGVtc1wiKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZWNlaXZlci5hbGxJZHMubWFwKChkKT0+b2JqLnByaW1pdGl2ZShkKSkuZmlsdGVyKChkKT0+ZClcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiggcHJvcCA9PT0gXCJ1bmlxdWVBbGxJdGVtc1wiKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZWNlaXZlci51bmlxdWVBbGxJZHMubWFwKChkKT0+b2JqLnByaW1pdGl2ZShkKSkuZmlsdGVyKChkKT0+ZClcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiggcHJvcCA9PT0gXCJ1bmlxdWVJdGVtc1wiKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZWNlaXZlci51bmlxdWVJZHMubWFwKChkKT0+b2JqLnByaW1pdGl2ZShkKSkuZmlsdGVyKChkKT0+ZClcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiggb2JqLnR5cGVzLmluY2x1ZGVzKHByb3ApKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZWNlaXZlci5pdGVtcy5maWx0ZXIoKHApPT5wLnR5cGU9PT1wcm9wKVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmKCBwcm9wLnNsaWNlKDAsNikgPT09ICd1bmlxdWUnICl7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgdHlwZSA9IHByb3Auc2xpY2UoNikudG9Mb3dlckNhc2UoKVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYoIG9iai50eXBlcy5pbmNsdWRlcyh0eXBlKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlY2VpdmVyLnVuaXF1ZUl0ZW1zLmZpbHRlcigocCk9PnAudHlwZSA9PT0gdHlwZSlcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiggcHJvcC5zbGljZSgwLDkpID09PSAnYWxsVW5pcXVlJyApe1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHR5cGUgPSBwcm9wLnNsaWNlKDkpLnRvTG93ZXJDYXNlKClcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKCBvYmoudHlwZXMuaW5jbHVkZXModHlwZSkpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZWNlaXZlci51bmlxdWVBbGxJdGVtcy5maWx0ZXIoKHApPT5wLnR5cGUgPT09IHR5cGUpXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYoIHByb3Auc2xpY2UoMCwzKSA9PT0gJ2FsbCcgKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCB0eXBlID0gcHJvcC5zbGljZSgzKS50b0xvd2VyQ2FzZSgpXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiggb2JqLnR5cGVzLmluY2x1ZGVzKHR5cGUpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVjZWl2ZXIuYWxsSXRlbXMuZmlsdGVyKChwKT0+cC50eXBlID09PSB0eXBlKVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmKCB0YXJnZXRbbnVsbF0pe1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFByb3h5KHRhcmdldFtudWxsXSwgc3RydWN0dXJlKVtwcm9wXVxuICAgICAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFByb3h5KFtdLCBzdHJ1Y3R1cmUpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzdHJ1Y3R1cmVcbiAgICB9Il0sIm1hcHBpbmdzIjoiMm9DQUFlLFNBQVNBLGVBQWVBLENBQUNDLEdBQUcsRUFBQztFQUN4QyxJ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