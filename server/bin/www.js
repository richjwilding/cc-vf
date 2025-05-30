#!/usr/bin/env node

/**
 * Module dependencies.
 */

import app from '../app';
import { SIO } from '../socket';
import debugLib from 'debug';
import http from 'http';
import QueueDocument from '../document_queue';
import QueueAI from '../ai_queue';
import EnrichPrimitive from '../enrich_queue';
import QueryQueue from '../query_queue';
import BrightDataQueue from '../brightdata_queue';

import FlowQueue from '../flow_queue';
import "../action_register"

const debug = debugLib('your-project-name:server');

/**
 * Get port from environment and store in Express.
 */


var port = normalizePort(process.env.PORT || '30001');
app.set('port', port);

/**
 * Create HTTP server.
 */

var server = http.createServer(app);

/**
 * Listen on provided port, on all network interfaces.
 */

SIO.init( server )
QueueDocument().myInit()
QueueAI().myInit()
EnrichPrimitive().myInit()
QueryQueue().myInit()
BrightDataQueue().myInit()
FlowQueue().myInit()

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

  var bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

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
      throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
  var addr = server.address();
  var bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr.port;
  debug('Listening on ' + bind);
}
