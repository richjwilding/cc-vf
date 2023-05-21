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

      if (prop === "descendantsInclude") {
        return function () {
          var value = arguments[0];
          if (value instanceof Object) {
            value = value.id;
          }
          return receiver.descendantIds.includes(value);
        };
      }
      if (prop === "includes") {
        return function () {
          var value = arguments[0];
          if (value instanceof Object) {
            value = value.id;
          }
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
            } else if (v !== undefined && v !== null) {
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
        if (target[prop] === null) {
          target[prop] = [];
        }
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
        if (prop === "descendants") {
          return receiver.descendantIds.map(function (d) {return obj.primitive(d);}).filter(function (d) {return d;});
        }
        if (prop === "descendantIds") {
          var children = receiver.allItems;
          var _out = children.map(function (d) {return d.id;});
          children.forEach(function (d) {
            _out = _out.concat(d.primitives.descendantIds);
          });
          return uniqueArray(_out.filter(function (d) {return d;}));
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQcmltaXRpdmVQYXJzZXIiLCJvYmoiLCJ1bmlxdWVBcnJheSIsImEiLCJmaWx0ZXIiLCJ2IiwiaSIsImluZGV4T2YiLCJzdHJ1Y3R1cmUiLCJnZXQiLCJ0YXJnZXQiLCJwcm9wIiwicmVjZWl2ZXIiLCJpdGVtIiwiYXJndW1lbnRzIiwicGF0aCIsImZyb21QYXRoIiwiY29uc29sZSIsIndhcm4iLCJsb2ciLCJ1bmRlZmluZWQiLCJhZGQiLCJBcnJheSIsInB1c2giLCJyZW1vdmUiLCJpZHgiLCJmaW5kSW5kZXgiLCJzcGxpY2UiLCJmcm9tIiwidG8iLCJ2YWx1ZSIsIk9iamVjdCIsImlkIiwiZGVzY2VuZGFudElkcyIsImluY2x1ZGVzIiwiZmluZCIsInZhbHVlcyIsInJlZHVjZSIsInIiLCJkIiwib3V0IiwiZm9yRWFjaCIsImtleXMiLCJtYXAiLCJrIiwiZmxhdCIsImxlbmd0aCIsInJlc3VsdCIsInN0ciIsImNvbmNhdCIsImpvaW4iLCJsZW4iLCJwIiwic2xpY2UiLCJyZXBsYWNlIiwicGF0aHMiLCJhcHBseSIsInNwbGl0IiwiaWRzIiwiZmxhdHRlbiIsImFsbElkcyIsImJhc2UiLCJhbGxJdGVtcyIsIkZ1bmN0aW9uIiwiX2xlbiIsImFyZ3MiLCJfa2V5IiwiaXNBcnJheSIsIlByb3h5IiwiX2xlbjIiLCJfa2V5MiIsInMiLCJ0b1N0cmluZyIsImNyZWF0ZSIsIm5vZGUiLCJsYXN0IiwicG9wIiwicmV2ZXJzZSIsIm8iLCJjIiwiX2RlZmluZVByb3BlcnR5IiwiYWRkTm9kZSIsInN0ZXAiLCJwcmV2TGFzdCIsInByZXZTdGVwIiwidW5kZXJseWluZyIsImFyciIsIm5lZWRDcmVhdGUiLCJpc19BIiwicHJpbWl0aXZlIiwidW5pcXVlQWxsSWRzIiwidW5pcXVlSWRzIiwidHlwZXMiLCJpdGVtcyIsInR5cGUiLCJ0b0xvd2VyQ2FzZSIsInVuaXF1ZUl0ZW1zIiwidW5pcXVlQWxsSXRlbXMiLCJjaGlsZHJlbiIsInByaW1pdGl2ZXMiXSwic291cmNlcyI6WyIuLi9zZXJ2ZXIvUHJpbWl0aXZlc1BhcnNlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBQcmltaXRpdmVQYXJzZXIob2JqKXtcbiAgICBjb25zdCB1bmlxdWVBcnJheSA9IChhKT0+e1xuICAgICAgICByZXR1cm4gYS5maWx0ZXIoKHYsaSk9PmEuaW5kZXhPZih2KSA9PT0gaSlcbiAgICB9XG4gICAgY29uc3Qgc3RydWN0dXJlID0ge1xuICAgICAgICAgICAgZ2V0KHRhcmdldCwgcHJvcCwgcmVjZWl2ZXIpIHtcbiAgICAgICAgICAgICAgICBpZiggcHJvcCA9PT0gXCJhZGRcIiApe1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBpdGVtID0gYXJndW1lbnRzWzBdXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiggYXJndW1lbnRzWzFdICl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcGF0aCA9IHJlY2VpdmVyLmZyb21QYXRoKGFyZ3VtZW50c1sxXSwgdHJ1ZSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiggIXBhdGgpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oYFBhdGggbm90IGZvdW5kYClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2cocGF0aClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHVuZGVmaW5lZFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcGF0aC5hZGQoaXRlbSlcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKCAhKHRhcmdldCBpbnN0YW5jZW9mIEFycmF5KSApe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKCAhKG51bGwgaW4gdGFyZ2V0KSApe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXRbbnVsbF0gPSBbXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXQgPSB0YXJnZXQubnVsbFxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LnB1c2goIGl0ZW0gKVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlY2VpdmVyIFxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmKCBwcm9wID09PSBcInJlbW92ZVwiICl7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGl0ZW0gPSBhcmd1bWVudHNbMF1cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKCBhcmd1bWVudHNbMV0gKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwYXRoID0gcmVjZWl2ZXIuZnJvbVBhdGgoYXJndW1lbnRzWzFdKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKCAhcGF0aCl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUud2FybihgUGF0aCBub3QgZm91bmRgKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhwYXRoKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBwYXRoLnJlbW92ZShpdGVtKVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYoICEodGFyZ2V0IGluc3RhbmNlb2YgQXJyYXkpICl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0ID0gdGFyZ2V0Lm51bGxcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBpZHggPSB0YXJnZXQuZmluZEluZGV4KChpKT0+IGkgPT09IGl0ZW0gKVxuICAgICAgICAgICAgICAgICAgICAgICAgd2hpbGUoaWR4ID4gLTEpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldC5zcGxpY2UoaWR4LDEpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWR4ID0gdGFyZ2V0LmZpbmRJbmRleCgoaSk9PiBpID09PSBpdGVtIClcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlY2VpdmVyIFxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmKCBwcm9wID09PSBcIm1vdmVcIiApe1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBpdGVtID0gYXJndW1lbnRzWzBdXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgZnJvbSA9ICByZWNlaXZlci5mcm9tUGF0aChhcmd1bWVudHNbMV0pXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgdG8gPSAgcmVjZWl2ZXIuZnJvbVBhdGgoYXJndW1lbnRzWzJdLCB0cnVlKVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYoIGZyb20gJiYgdG8gKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmcm9tLnJlbW92ZShpdGVtKVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYoIHRvICl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdG8uYWRkKGl0ZW0pXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdG9cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmKCBwcm9wID09PSBcImRlc2NlbmRhbnRzSW5jbHVkZVwiICl7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHZhbHVlID0gYXJndW1lbnRzWzBdXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiggdmFsdWUgaW5zdGFuY2VvZihPYmplY3QpICl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZS5pZFxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlY2VpdmVyLmRlc2NlbmRhbnRJZHMuaW5jbHVkZXModmFsdWUpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYoIHByb3AgPT09IFwiaW5jbHVkZXNcIiApe1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24oKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCB2YWx1ZSA9IGFyZ3VtZW50c1swXVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYoIHZhbHVlIGluc3RhbmNlb2YgIE9iamVjdCl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSB2YWx1ZS5pZFxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZmluZCA9ICh2KT0+e1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBPYmplY3QudmFsdWVzKHYpLnJlZHVjZSgociwgZCk9PntcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYoIGQgaW5zdGFuY2VvZihPYmplY3QpICl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gciB8fCBmaW5kKGQpIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByIHx8IChkID09PSB2YWx1ZSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0sZmFsc2UpXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmluZCggdGFyZ2V0IClcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiggcHJvcCA9PT0gXCJwYXRoc1wiICl7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGlkID0gYXJndW1lbnRzWzBdXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmaW5kID0gKHYsIHBhdGgpPT57XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IG91dCA9IFtdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYoIHYgaW5zdGFuY2VvZihBcnJheSkgKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYoIHYuaW5jbHVkZXMoIGlkICkpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3V0LnB1c2goIHBhdGggKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHYuZmlsdGVyKChkKT0+ZCBpbnN0YW5jZW9mKE9iamVjdCkgKS5mb3JFYWNoKChkKT0+e1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3V0LnB1c2goIE9iamVjdC5rZXlzKGQpLm1hcCgoayk9PntcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmluZCggZFtrXSwgcGF0aCArIFwiLlwiICsgaylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1lbHNlIGlmKCB2ICE9PSB1bmRlZmluZWQgJiYgdiAhPT0gbnVsbCl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG91dC5wdXNoKCBPYmplY3Qua2V5cyh2KS5tYXAoKGspPT57XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmluZCggdltrXSwgcGF0aCArIFwiLlwiICsgaylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSkpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG91dCA9IG91dC5mbGF0KDIpLmZpbHRlcigoZCk9PmQgIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gb3V0Lmxlbmd0aCA+IDAgPyBvdXQgOiB1bmRlZmluZWRcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCByZXN1bHQgPSBmaW5kKCB0YXJnZXQsIFwiXCIgKVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYoIGFyZ3VtZW50cy5sZW5ndGggPT0gMil7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHN0ciA9IGFyZ3VtZW50c1sxXSBpbnN0YW5jZW9mKEFycmF5KSA/IGAuJHthcmd1bWVudHNbMV0uam9pbignLicpfS5gIDogYXJndW1lbnRzWzFdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IGxlbiA9IHN0ci5sZW5ndGhcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSByZXN1bHQuZmlsdGVyKChwKT0+cC5zbGljZSgwLCBsZW4pID09PSBzdHIpXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiggcmVzdWx0ICl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0ID0gcmVzdWx0Lm1hcCgocCk9PnAucmVwbGFjZSgvXlxcLm51bGwvLFwiXCIpKVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmKCBwcm9wID09PSBcInJlbGF0aW9uc2hpcHNcIil7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbigpe1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHBhdGggPSByZWNlaXZlci5wYXRocyguLi5hcmd1bWVudHMpXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcGF0aD8ubWFwKChwKT0+cC5zcGxpdCgnLicpLnNsaWNlKC0xKVswXSlcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiggcHJvcCA9PT0gXCJhbGxcIil7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0YXJnZXRcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYoIHByb3AgPT09IFwiaWRzXCIgJiYgdGFyZ2V0IGluc3RhbmNlb2YoQXJyYXkpKXtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRhcmdldC5tYXAoKGQpPT57XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiggZCBpbnN0YW5jZW9mKE9iamVjdCkpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB1bmRlZmluZWRcbiAgICAgICAgICAgICAgICAgICAgICAgIH1lbHNle1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBkXG4gICAgICAgICAgICAgICAgICAgICAgICB9fSkuZmlsdGVyKChkKT0+ZClcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYoIHByb3AgPT09IFwidW5pcXVlSWRzXCIgJiYgdGFyZ2V0IGluc3RhbmNlb2YoQXJyYXkpKXtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHVuaXF1ZUFycmF5KCByZWNlaXZlci5pZHMgKVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmKCBwcm9wID09PSBcImFsbElkc1wiKXtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZmxhdHRlbiA9ICh2KT0+e1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIE9iamVjdC52YWx1ZXModikubWFwKChkKT0+e1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKCBkIGluc3RhbmNlb2YoT2JqZWN0KSApe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmxhdHRlbihkKSBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9KS5mbGF0KClcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmxhdHRlbiggdGFyZ2V0IClcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYoIHByb3AgPT09IFwidW5pcXVlQWxsSWRzXCIpe1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdW5pcXVlQXJyYXkoIHJlY2VpdmVyLmFsbElkcyApXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmKCBwcm9wID09PSBcImZpbHRlclwiIHx8IHByb3AgPT09IFwibGVuZ3RoXCIgfHwgcHJvcCA9PT0gXCJtYXBcIil7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGJhc2UgPSByZWNlaXZlci5hbGxJdGVtc1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB2YWx1ZSA9IGJhc2VbcHJvcF07XG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIEZ1bmN0aW9uKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24gKC4uLmFyZ3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdmFsdWUuYXBwbHkoYmFzZSwgYXJncyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmKCBBcnJheS5pc0FycmF5KHRhcmdldCkgKXtcbiAgICAgICAgICAgICAgICAgICAgbGV0IG91dFxuICAgICAgICAgICAgICAgICAgICB0YXJnZXQuZm9yRWFjaCgoZCk9PntcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKCBkIGluc3RhbmNlb2YoT2JqZWN0KSApe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKCBwcm9wIGluIGQpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvdXQgPSBkW3Byb3BdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICBpZiggb3V0ICl7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gbmV3IFByb3h5KG91dCwgc3RydWN0dXJlKVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmKCBwcm9wIGluIHRhcmdldCApe1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdmFsdWUgPSB0YXJnZXRbcHJvcF07XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBGdW5jdGlvbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uICguLi5hcmdzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlLmFwcGx5KHRoaXMgPT09IHJlY2VpdmVyID8gdGFyZ2V0IDogdGhpcywgYXJncyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYoIHZhbHVlIGluc3RhbmNlb2YgT2JqZWN0ICl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG5ldyBQcm94eSh2YWx1ZSwgc3RydWN0dXJlKVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmKCBwcm9wIGluIHRhcmdldCApe1xuICAgICAgICAgICAgICAgICAgICBpZiggdGFyZ2V0W3Byb3BdID09PSBudWxsICl7XG4gICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXRbcHJvcF0gPSBbXVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBuZXcgUHJveHkodGFyZ2V0W3Byb3BdLCBzdHJ1Y3R1cmUpXG4gICAgICAgICAgICAgICAgfWVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBsZXQgcyA9IHByb3AudG9TdHJpbmcoKVxuICAgICAgICAgICAgICAgICAgICBpZiggcyBpbiB0YXJnZXQgKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBuZXcgUHJveHkodGFyZ2V0W3NdLCBzdHJ1Y3R1cmUpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYoIHByb3AgPT09IFwidW5kZXJseWluZ1wiKXtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRhcmdldFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiggcHJvcCA9PT0gXCJmcm9tUGF0aFwiKXtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKHBhdGgsIGNyZWF0ZSA9IGZhbHNlKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBub2RlID0gcmVjZWl2ZXIgICAgICAgICAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKCB0eXBlb2YocGF0aCkgPT09IFwic3RyaW5nXCIpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhdGggPSBwYXRoLnNwbGl0KCcuJylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBsYXN0ID0gcGF0aC5wb3AoKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKCBwYXRoLmxlbmd0aCA9PT0gMCl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhdGggPSBsYXN0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfWVsc2V7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0aCA9IHBhdGgucmV2ZXJzZSgpLnJlZHVjZSgobywgYywgaWR4KT0+e1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtbY106IGlkeCA9PT0gMCA/IGxhc3QgOiBvfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LHt9KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgYWRkTm9kZSA9ICggbGFzdCwgc3RlcCwgcHJldkxhc3QsIHByZXZTdGVwKT0+e1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCB1bmRlcmx5aW5nID0gbGFzdC51bmRlcmx5aW5nXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5sb2coYGFkZGluZyAke3N0ZXB9YClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiggQXJyYXkuaXNBcnJheSh1bmRlcmx5aW5nICkgKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYoIHVuZGVybHlpbmcubGVuZ3RoID09PSAwICYmIHByZXZMYXN0ICl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiggQXJyYXkuaXNBcnJheShwcmV2TGFzdCkgKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBhcnIgPSBwcmV2TGFzdC51bmRlcmx5aW5nLmZpbmQoKGQpPT5PYmplY3Qua2V5cyhkKVswXSA9PSBwcmV2U3RlcClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiggYXJyICApe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhcnJbcHJldlN0ZXBdID0ge31cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9ZWxzZXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcmV2TGFzdC51bmRlcmx5aW5nW3ByZXZTdGVwXSA9IHt9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsYXN0ID0gcHJldkxhc3RbcHJldlN0ZXBdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1bmRlcmx5aW5nID0gbGFzdC51bmRlcmx5aW5nXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1bmRlcmx5aW5nW3N0ZXBdID0gW11cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1bmRlcmx5aW5nLnB1c2goe1tzdGVwXTogW119KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHVuZGVybHlpbmdbc3RlcF0gPSBbXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gbGFzdFxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgcHJldkxhc3RcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCBwcmV2U3RlcFxuXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBuZWVkQ3JlYXRlID0gKHN0ZXAsIGxhc3QpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBpc19BID0gQXJyYXkuaXNBcnJheShsYXN0LnVuZGVybHlpbmcpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIChpc19BICYmICFsYXN0LnVuZGVybHlpbmdbc3RlcF0gJiYgIWxhc3QudW5kZXJseWluZy5maW5kKChkKT0+T2JqZWN0LmtleXMoZCkuaW5jbHVkZXMoc3RlcCkpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHx8ICghaXNfQSAmJiBsYXN0LnVuZGVybHlpbmdbc3RlcF0gPT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgd2hpbGUoIHBhdGggaW5zdGFuY2VvZihPYmplY3QpICl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHN0ZXAgPSBPYmplY3Qua2V5cyhwYXRoKVswXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCBsYXN0ID0gbm9kZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhdGggPSBwYXRoW3N0ZXBdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZSA9IG5vZGVbc3RlcF1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiggbmVlZENyZWF0ZShzdGVwLCBsYXN0KSApe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiggY3JlYXRlICl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsYXN0ID0gYWRkTm9kZSggbGFzdCwgc3RlcCwgcHJldkxhc3QsIHByZXZTdGVwKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZSA9IGxhc3Rbc3RlcF1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJldkxhc3QgPSBsYXN0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJldlN0ZXAgPSBzdGVwXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiggbmVlZENyZWF0ZShwYXRoLCBub2RlKSAmJiBjcmVhdGUgKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlID0gYWRkTm9kZSggbm9kZSwgcGF0aCwgcHJldkxhc3QsIHByZXZTdGVwKVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG5vZGVbcGF0aF1cblxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmKCBvYmogKXtcbiAgICAgICAgICAgICAgICAgICAgLy8gd2FzIGhlcmVcbiAgICAgICAgICAgICAgICAgICAgaWYoIHByb3AgPT09IFwiaXRlbXNcIil7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVjZWl2ZXIuaWRzLm1hcCgoZCk9Pm9iai5wcmltaXRpdmUoZCkpLmZpbHRlcigoZCk9PmQpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYoIHByb3AgPT09IFwiYWxsSXRlbXNcIil7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVjZWl2ZXIuYWxsSWRzLm1hcCgoZCk9Pm9iai5wcmltaXRpdmUoZCkpLmZpbHRlcigoZCk9PmQpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYoIHByb3AgPT09IFwidW5pcXVlQWxsSXRlbXNcIil7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVjZWl2ZXIudW5pcXVlQWxsSWRzLm1hcCgoZCk9Pm9iai5wcmltaXRpdmUoZCkpLmZpbHRlcigoZCk9PmQpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYoIHByb3AgPT09IFwidW5pcXVlSXRlbXNcIil7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVjZWl2ZXIudW5pcXVlSWRzLm1hcCgoZCk9Pm9iai5wcmltaXRpdmUoZCkpLmZpbHRlcigoZCk9PmQpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYoIG9iai50eXBlcy5pbmNsdWRlcyhwcm9wKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVjZWl2ZXIuaXRlbXMuZmlsdGVyKChwKT0+cC50eXBlPT09cHJvcClcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZiggcHJvcC5zbGljZSgwLDYpID09PSAndW5pcXVlJyApe1xuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHR5cGUgPSBwcm9wLnNsaWNlKDYpLnRvTG93ZXJDYXNlKClcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmKCBvYmoudHlwZXMuaW5jbHVkZXModHlwZSkpe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiByZWNlaXZlci51bmlxdWVJdGVtcy5maWx0ZXIoKHApPT5wLnR5cGUgPT09IHR5cGUpXG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYoIHByb3Auc2xpY2UoMCw5KSA9PT0gJ2FsbFVuaXF1ZScgKXtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxldCB0eXBlID0gcHJvcC5zbGljZSg5KS50b0xvd2VyQ2FzZSgpXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiggb2JqLnR5cGVzLmluY2x1ZGVzKHR5cGUpKXtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gcmVjZWl2ZXIudW5pcXVlQWxsSXRlbXMuZmlsdGVyKChwKT0+cC50eXBlID09PSB0eXBlKVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGlmKCBwcm9wLnNsaWNlKDAsMykgPT09ICdhbGwnICl7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgdHlwZSA9IHByb3Auc2xpY2UoMykudG9Mb3dlckNhc2UoKVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYoIG9iai50eXBlcy5pbmNsdWRlcyh0eXBlKSl7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlY2VpdmVyLmFsbEl0ZW1zLmZpbHRlcigocCk9PnAudHlwZSA9PT0gdHlwZSlcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZihwcm9wID09PSBcImRlc2NlbmRhbnRzXCIpe1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJlY2VpdmVyLmRlc2NlbmRhbnRJZHMubWFwKChkKT0+b2JqLnByaW1pdGl2ZShkKSkuZmlsdGVyKChkKT0+ZClcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBpZihwcm9wID09PSBcImRlc2NlbmRhbnRJZHNcIil7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjaGlsZHJlbiA9IHJlY2VpdmVyLmFsbEl0ZW1zXG4gICAgICAgICAgICAgICAgICAgICAgICBsZXQgb3V0ID0gY2hpbGRyZW4ubWFwKChkKT0+ZC5pZClcbiAgICAgICAgICAgICAgICAgICAgICAgIGNoaWxkcmVuLmZvckVhY2goKGQpPT57XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgb3V0ID0gb3V0LmNvbmNhdCggZC5wcmltaXRpdmVzLmRlc2NlbmRhbnRJZHMgKVxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB1bmlxdWVBcnJheShvdXQuZmlsdGVyKChkKT0+ZCkpXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYoIHRhcmdldFtudWxsXSl7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBuZXcgUHJveHkodGFyZ2V0W251bGxdLCBzdHJ1Y3R1cmUpW3Byb3BdXG4gICAgICAgICAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBuZXcgUHJveHkoW10sIHN0cnVjdHVyZSlcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHN0cnVjdHVyZVxuICAgIH0iXSwibWFwcGluZ3MiOiIyb0NBQWUsU0FBU0EsZUFBZUEsQ0FBQ0MsR0FBRyxFQUFDO0VBQ3hDLElBQU1DLFdBQVcsR0FBRyxTQUFkQSxXQUFXQSxDQUFJQyxDQUFDLEVBQUc7SUFDckIsT0FBT0EsQ0FBQyxDQUFDQyxNQUFNLENBQUMsVUFBQ0MsQ0FBQyxFQUFDQyxDQUFDLFVBQUdILENBQUMsQ0FBQ0ksT0FBTyxDQUFDRixDQUFDLENBQUMsS0FBS0MsQ0FBQyxHQUFDO0VBQzlDLENBQUM7RUFDRCxJQUFNRSxTQUFTLEdBQUc7SUFDVkMsR0FBRyxXQUFBQSxJQUFDQyxNQUFNLEVBQUVDLElBQUksRUFBRUMsUUFBUSxFQUFFO01BQ3hCLElBQUlELElBQUksS0FBSyxLQUFLLEVBQUU7UUFDaEIsT0FBTyxZQUFVO1VBQ2IsSUFBSUUsSUFBSSxHQUFHQyxTQUFTLENBQUMsQ0FBQyxDQUFDO1VBQ3ZCLElBQUlBLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUNkLElBQU1DLElBQUksR0FBR0gsUUFBUSxDQUFDSSxRQUFRLENBQUNGLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUM7O1lBRWxELElBQUksQ0FBQ0MsSUFBSSxFQUFDO2NBQ05FLE9BQU8sQ0FBQ0MsSUFBSSxrQkFBa0I7Y0FDOUJE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