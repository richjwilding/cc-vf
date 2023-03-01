"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = PrimitiveParser;
function PrimitiveParser(obj) {
  var uniqueArray = function uniqueArray(a) {
    return a.filter(function (v, i) {
      return a.indexOf(v) === i;
    });
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
          var idx = target.findIndex(function (i) {
            return i === item;
          });
          while (idx > -1) {
            target.splice(idx, 1);
            idx = target.findIndex(function (i) {
              return i === item;
            });
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
              v.filter(function (d) {
                return d instanceof Object;
              }).forEach(function (d) {
                out.push(Object.keys(d).map(function (k) {
                  return find(d[k], path + "." + k);
                }));
              });
            } else {
              out.push(Object.keys(v).map(function (k) {
                return find(v[k], path + "." + k);
              }));
            }
            out = out.flat(2).filter(function (d) {
              return d !== undefined;
            });
            return out.length > 0 ? out : undefined;
          };
          var result = find(target, "");
          if (arguments.length == 2) {
            var str = arguments[1] instanceof Array ? ".".concat(arguments[1].join('.'), ".") : arguments[1];
            var len = str.length;
            result = result.filter(function (p) {
              return p.slice(0, len) === str;
            });
          }
          if (result) {
            result = result.map(function (p) {
              return p.replace(/^\.null/, "");
            });
          }
          return result;
        };
      }
      if (prop === "relationships") {
        return function () {
          var path = receiver.paths.apply(receiver, arguments);
          return path === null || path === void 0 ? void 0 : path.map(function (p) {
            return p.split('.').slice(-1)[0];
          });
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
          }
        }).filter(function (d) {
          return d;
        });
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
          return function () {
            for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
              args[_key] = arguments[_key];
            }
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
            return function () {
              for (var _len2 = arguments.length, args = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
                args[_key2] = arguments[_key2];
              }
              return _value.apply(this === receiver ? target : this, args);
            };
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
      if (prop === "fromPath") {
        return function (path) {
          var create = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
          var node = receiver;
          while (path instanceof Object) {
            var step = Object.keys(path)[0];
            var last = node;
            path = path[step];
            node = node[step];
            if (node === undefined) {
              if (create) {
                last[step] = {};
                node = last[step];
              } else {
                return undefined;
              }
            }
          }
          if (!node[path] && create) {
            node[path] = [];
          }
          return node[path];
        };
      }
      if (obj) {
        // was here
        if (prop === "items") {
          return receiver.ids.map(function (d) {
            return obj.primitive(d);
          }).filter(function (d) {
            return d;
          });
        }
        if (prop === "allItems") {
          return receiver.allIds.map(function (d) {
            return obj.primitive(d);
          }).filter(function (d) {
            return d;
          });
        }
        if (prop === "uniqueAllItems") {
          return receiver.uniqueAllIds.map(function (d) {
            return obj.primitive(d);
          }).filter(function (d) {
            return d;
          });
        }
        if (prop === "uniqueItems") {
          return receiver.uniqueIds.map(function (d) {
            return obj.primitive(d);
          }).filter(function (d) {
            return d;
          });
        }
        if (obj.types.includes(prop)) {
          return receiver.items.filter(function (p) {
            return p.type === prop;
          });
        }
        if (prop.slice(0, 6) === 'unique') {
          var type = prop.slice(6).toLowerCase();
          if (obj.types.includes(type)) {
            return receiver.uniqueItems.filter(function (p) {
              return p.type === type;
            });
          }
        }
        if (prop.slice(0, 9) === 'allUnique') {
          var _type = prop.slice(9).toLowerCase();
          if (obj.types.includes(_type)) {
            return receiver.uniqueAllItems.filter(function (p) {
              return p.type === _type;
            });
          }
        }
        if (prop.slice(0, 3) === 'all') {
          var _type2 = prop.slice(3).toLowerCase();
          if (obj.types.includes(_type2)) {
            return receiver.allItems.filter(function (p) {
              return p.type === _type2;
            });
          }
        }
      }
      if (target[null]) {
        return new Proxy(target[null], structure)[prop];
      }
    }
  };
  return structure;
}