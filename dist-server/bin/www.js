#!/usr/bin/env node

/**
 * Module dependencies.
 */"use strict";

var _app = _interopRequireDefault(require("../app"));
var _debug = _interopRequireDefault(require("debug"));
var _http = _interopRequireDefault(require("http"));function _interopRequireDefault(obj) {return obj && obj.__esModule ? obj : { "default": obj };}
var debug = (0, _debug["default"])('your-project-name:server');

/**
 * Get port from environment and store in Express.
 */


var port = normalizePort(process.env.PORT || '30001');
_app["default"].set('port', port);

/**
 * Create HTTP server.
 */

var server = _http["default"].createServer(_app["default"]);

/**
 * Listen on provided port, on all network interfaces.
 */

server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

/**
 * Normalize a port into a number, string, or false.
 */

function normalizePort(val) {
  var port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  var bind = typeof port === 'string' ?
  'Pipe ' + port :
  'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;}

}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
  var addr = server.address();
  var bind = typeof addr === 'string' ?
  'pipe ' + addr :
  'port ' + addr.port;
  debug('Listening on ' + bind);
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfYXBwIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfZGVidWciLCJfaHR0cCIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWJ1ZyIsImRlYnVnTGliIiwicG9ydCIsIm5vcm1hbGl6ZVBvcnQiLCJwcm9jZXNzIiwiZW52IiwiUE9SVCIsImFwcCIsInNldCIsInNlcnZlciIsImh0dHAiLCJjcmVhdGVTZXJ2ZXIiLCJsaXN0ZW4iLCJvbiIsIm9uRXJyb3IiLCJvbkxpc3RlbmluZyIsInZhbCIsInBhcnNlSW50IiwiaXNOYU4iLCJlcnJvciIsInN5c2NhbGwiLCJiaW5kIiwiY29kZSIsImNvbnNvbGUiLCJleGl0IiwiYWRkciIsImFkZHJlc3MiXSwic291cmNlcyI6WyIuLi8uLi9zZXJ2ZXIvYmluL3d3dy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIjIS91c3IvYmluL2VudiBub2RlXG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG5pbXBvcnQgYXBwIGZyb20gJy4uL2FwcCc7XG5pbXBvcnQgZGVidWdMaWIgZnJvbSAnZGVidWcnO1xuaW1wb3J0IGh0dHAgZnJvbSAnaHR0cCc7XG5jb25zdCBkZWJ1ZyA9IGRlYnVnTGliKCd5b3VyLXByb2plY3QtbmFtZTpzZXJ2ZXInKTtcblxuLyoqXG4gKiBHZXQgcG9ydCBmcm9tIGVudmlyb25tZW50IGFuZCBzdG9yZSBpbiBFeHByZXNzLlxuICovXG5cblxudmFyIHBvcnQgPSBub3JtYWxpemVQb3J0KHByb2Nlc3MuZW52LlBPUlQgfHwgJzMwMDAxJyk7XG5hcHAuc2V0KCdwb3J0JywgcG9ydCk7XG5cbi8qKlxuICogQ3JlYXRlIEhUVFAgc2VydmVyLlxuICovXG5cbnZhciBzZXJ2ZXIgPSBodHRwLmNyZWF0ZVNlcnZlcihhcHApO1xuXG4vKipcbiAqIExpc3RlbiBvbiBwcm92aWRlZCBwb3J0LCBvbiBhbGwgbmV0d29yayBpbnRlcmZhY2VzLlxuICovXG5cbnNlcnZlci5saXN0ZW4ocG9ydCk7XG5zZXJ2ZXIub24oJ2Vycm9yJywgb25FcnJvcik7XG5zZXJ2ZXIub24oJ2xpc3RlbmluZycsIG9uTGlzdGVuaW5nKTtcblxuLyoqXG4gKiBOb3JtYWxpemUgYSBwb3J0IGludG8gYSBudW1iZXIsIHN0cmluZywgb3IgZmFsc2UuXG4gKi9cblxuZnVuY3Rpb24gbm9ybWFsaXplUG9ydCh2YWwpIHtcbiAgdmFyIHBvcnQgPSBwYXJzZUludCh2YWwsIDEwKTtcblxuICBpZiAoaXNOYU4ocG9ydCkpIHtcbiAgICAvLyBuYW1lZCBwaXBlXG4gICAgcmV0dXJuIHZhbDtcbiAgfVxuXG4gIGlmIChwb3J0ID49IDApIHtcbiAgICAvLyBwb3J0IG51bWJlclxuICAgIHJldHVybiBwb3J0O1xuICB9XG5cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIEV2ZW50IGxpc3RlbmVyIGZvciBIVFRQIHNlcnZlciBcImVycm9yXCIgZXZlbnQuXG4gKi9cblxuZnVuY3Rpb24gb25FcnJvcihlcnJvcikge1xuICBpZiAoZXJyb3Iuc3lzY2FsbCAhPT0gJ2xpc3RlbicpIHtcbiAgICB0aHJvdyBlcnJvcjtcbiAgfVxuXG4gIHZhciBiaW5kID0gdHlwZW9mIHBvcnQgPT09ICdzdHJpbmcnXG4gICAgPyAnUGlwZSAnICsgcG9ydFxuICAgIDogJ1BvcnQgJyArIHBvcnQ7XG5cbiAgLy8gaGFuZGxlIHNwZWNpZmljIGxpc3RlbiBlcnJvcnMgd2l0aCBmcmllbmRseSBtZXNzYWdlc1xuICBzd2l0Y2ggKGVycm9yLmNvZGUpIHtcbiAgICBjYXNlICdFQUNDRVMnOlxuICAgICAgY29uc29sZS5lcnJvcihiaW5kICsgJyByZXF1aXJlcyBlbGV2YXRlZCBwcml2aWxlZ2VzJyk7XG4gICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdFQUREUklOVVNFJzpcbiAgICAgIGNvbnNvbGUuZXJyb3IoYmluZCArICcgaXMgYWxyZWFkeSBpbiB1c2UnKTtcbiAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgfVxufVxuXG4vKipcbiAqIEV2ZW50IGxpc3RlbmVyIGZvciBIVFRQIHNlcnZlciBcImxpc3RlbmluZ1wiIGV2ZW50LlxuICovXG5cbmZ1bmN0aW9uIG9uTGlzdGVuaW5nKCkge1xuICB2YXIgYWRkciA9IHNlcnZlci5hZGRyZXNzKCk7XG4gIHZhciBiaW5kID0gdHlwZW9mIGFkZHIgPT09ICdzdHJpbmcnXG4gICAgPyAncGlwZSAnICsgYWRkclxuICAgIDogJ3BvcnQgJyArIGFkZHIucG9ydDtcbiAgZGVidWcoJ0xpc3RlbmluZyBvbiAnICsgYmluZCk7XG59XG4iXSwibWFwcGluZ3MiOiJBQUFBOztBQUVBO0FBQ0E7QUFDQSxHQUZBOztBQUlBLElBQUFBLElBQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLE1BQUEsR0FBQUYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFFLEtBQUEsR0FBQUgsc0JBQUEsQ0FBQUMsT0FBQSxVQUF3QixTQUFBRCx1QkFBQUksR0FBQSxVQUFBQSxHQUFBLElBQUFBLEdBQUEsQ0FBQUMsVUFBQSxHQUFBRCxHQUFBLGdCQUFBQSxHQUFBO0FBQ3hCLElBQU1FLEtBQUssR0FBRyxJQUFBQyxpQkFBUSxFQUFDLDBCQUEwQixDQUFDOztBQUVsRDtBQUNBO0FBQ0E7OztBQUdBLElBQUlDLElBQUksR0FBR0MsYUFBYSxDQUFDQyxPQUFPLENBQUNDLEdBQUcsQ0FBQ0MsSUFBSSxJQUFJLE9BQU8sQ0FBQztBQUNyREMsZUFBRyxDQUFDQyxHQUFHLENBQUMsTUFBTSxFQUFFTixJQUFJLENBQUM7O0FBRXJCO0FBQ0E7QUFDQTs7QUFFQSxJQUFJTyxNQUFNLEdBQUdDLGdCQUFJLENBQUNDLFlBQVksQ0FBQ0osZUFBRyxDQUFDOztBQUVuQztBQUNBO0FBQ0E7O0FBRUFFLE1BQU0sQ0FBQ0csTUFBTSxDQUFDVixJQUFJLENBQUM7QUFDbkJPLE1BQU0sQ0FBQ0ksRUFBRSxDQUFDLE9BQU8sRUFBRUMsT0FBTyxDQUFDO0FBQzNCTCxNQUFNLENBQUNJLEVBQUUsQ0FBQyxXQUFXLEVBQUVFLFdBQVcsQ0FBQzs7QUFFbkM7QUFDQTtBQUNBOztBQUVBLFNBQVNaLGFBQWFBLENBQUNhLEdBQUcsRUFBRTtFQUMxQixJQUFJZCxJQUFJLEdBQUdlLFFBQVEsQ0FBQ0QsR0FBRyxFQUFFLEVBQUUsQ0FBQzs7RUFFNUIsSUFBSUUsS0FBSyxDQUFDaEIsSUFBSSxDQUFDLEVBQUU7SUFDZjtJQUNBLE9BQU9jLEdBQUc7RUFDWjs7RUFFQSxJQUFJZCxJQUFJLElBQUksQ0FBQyxFQUFFO0lBQ2I7SUFDQSxPQUFPQSxJQUFJO0VBQ2I7O0VBRUEsT0FBTyxLQUFLO0FBQ2Q7O0FBRUE7QUFDQTtBQUNBOztBQUVBLFNBQVNZLE9BQU9BLENBQUNLLEtBQUssRUFBRTtFQUN0QixJQUFJQSxLQUFLLENBQUNDLE9BQU8sS0FBSyxRQUFRLEVBQUU7SUFDOUIsTUFBTUQsS0FBSztFQUNiOztFQUVBLElBQUlFLElBQUksR0FBRyxPQUFPbkIsSUFBSSxLQUFLLFFBQVE7RUFDL0IsT0FBTyxHQUFHQSxJQUFJO0VBQ2QsT0FBTyxHQUFHQSxJQUFJOztFQUVsQjtFQUNBLFFBQVFpQixLQUFLLENBQUNHLElBQUk7SUFDaEIsS0FBSyxRQUFRO01BQ1hDLE9BQU8sQ0FBQ0osS0FBSyxDQUFDRSxJQUFJLEdBQUcsK0JBQStCLENBQUM7TUFDckRqQixPQUFPLENBQUNvQixJQUFJLENBQUMsQ0FBQyxDQUFDO01BQ2Y7SUFDRixLQUFLLFlBQVk7TUFDZkQsT0FBTyxDQUFDSixLQUFLLENBQUNFLElBQUksR0FBRyxvQkFBb0IsQ0FBQztNQUMxQ2pCLE9BQU8sQ0FBQ29CLElBQUksQ0FBQyxDQUFDLENBQUM7TUFDZjtJQUNGO01BQ0UsTUFBTUwsS0FBSyxDQUFDOztBQUVsQjs7QUFFQTtBQUNBO0FBQ0E7O0FBRUEsU0FBU0osV0FBV0EsQ0FBQSxFQUFHO0VBQ3JCLElBQUlVLElBQUksR0FBR2hCLE1BQU0sQ0FBQ2lCLE9BQU8sRUFBRTtFQUMzQixJQUFJTCxJQUFJLEdBQUcsT0FBT0ksSUFBSSxLQUFLLFFBQVE7RUFDL0IsT0FBTyxHQUFHQSxJQUFJO0VBQ2QsT0FBTyxHQUFHQSxJQUFJLENBQUN2QixJQUFJO0VBQ3ZCRixLQUFLLENBQUMsZUFBZSxHQUFHcUIsSUFBSSxDQUFDO0FBQy9CIn0=