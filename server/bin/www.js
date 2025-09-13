#!/usr/bin/env node

/**
 * Module dependencies.
 */

import app from '../app';
import crypto from 'crypto';
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
import { getPubSubClients } from '../redis';
import { getQueue } from '../queue_registry';

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

// Ensure a stable UUID for this process before queues are constructed
if (!process.env.INSTANCE_UUID) {
  process.env.INSTANCE_UUID = crypto.randomUUID();
}

SIO.init( server )
const q1 = QueueDocument(); q1.myInit();
const q2 = QueueAI();       q2.myInit();
const q3 = EnrichPrimitive(); q3.myInit();
const q4 = QueryQueue();    q4.myInit();
const q5 = BrightDataQueue(); q5.myInit();
const q6 = FlowQueue();     q6.myInit();

// Heartbeat: log webserver queues periodically
const webQueues = [q1, q2, q3, q4, q5, q6].filter(Boolean);
async function logWebHeartbeat() {
  try {
    console.log(`[hb-web] instance=${process.env.INSTANCE_UUID}`);
    for (const inst of webQueues) {
      const qm = inst?._queue;
      if (!qm) continue;
      for (const [name, bullq] of Object.entries(qm.queues || {})) {
        try {
          const c = await bullq.getJobCounts('waiting','active','waiting-children','delayed','failed','completed');
          console.log(`[hb-web] ${name} waiting=${c.waiting||0} active=${c.active||0} wchildren=${c['waiting-children']||0} delayed=${c.delayed||0} failed=${c.failed||0} completed=${c.completed||0}`);
        } catch (e) {
          console.log(`[hb-web] ${name} error ${e?.message || e}`);
        }
      }
    }
  } catch (e) {
    console.log('[hb-web] error', e?.message || e);
  }
}
const WEB_HEARTBEAT_MS = Number(process.env.WEB_HEARTBEAT_MS || process.env.WORKER_HEARTBEAT_MS || 30000);
setInterval(() => { logWebHeartbeat(); }, WEB_HEARTBEAT_MS);

// Subscribe to cross-service queue control to mirror local queue objects
(async () => {
  try {
    // Ensure this process has a stable UUID for control message filtering
    if (!process.env.INSTANCE_UUID) {
      process.env.INSTANCE_UUID = crypto.randomUUID();
    }
    const CONTROL_CHANNEL = 'queue:control';
    const { pub, sub } = await getPubSubClients();
    await sub.subscribe(CONTROL_CHANNEL, async (raw) => {
      try {
        const msg = JSON.parse(raw || '{}');
        if (!msg?.cmd) return;
        if (msg?.sourceId && msg.sourceId === process.env.INSTANCE_UUID) {
          // Ignore our own messages
          return;
        }
        const type = msg.queueType;
        const name = msg.queueName;
        const workspaceId = msg.workspaceId || (name ? String(name).split('-')[0] : undefined);
        if (!type || !workspaceId) return;

        const q = await getQueue(type);
        const qm = q?._queue;
        if (!qm) return;
        if (msg.cmd === 'watch') {
          console.error(`[web] recieved watch ${type} / ${workspaceId} from ${msg.source}`);
          await qm.getQueue(workspaceId, { suppressControl: true });
        } else if (msg.cmd === 'stop') {
          console.error(`[web] recieved stop ${type} / ${workspaceId}  from ${msg.source}`);
          // Mirror-only local teardown; avoid double obliterate across services
          await qm.mirrorStop(workspaceId, name);
        }
      } catch (e) {
        console.error('[web] control message error', e);
      }
    });
    // no explicit close path here; process exit will drop sockets
  } catch (e) {
    console.error('[web] failed subscribing to control channel', e);
  }
})();

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
