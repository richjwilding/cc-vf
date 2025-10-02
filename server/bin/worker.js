#!/usr/bin/env node

import * as dotenv from 'dotenv' 
import crypto from 'crypto'
import { updateBrightDataWhitelist } from '../brightdata.js';
const express = require('express');
const { getRedisBase, getPubSubClients } = require('../redis.js');

updateBrightDataWhitelist()

if( process.env.NODE_ENV === "development"){
    dotenv.config({ path: `.env.worker` })
}else{
    dotenv.config()
}

// Generate a per-process UUID to tag control messages and filter echoes
const INSTANCE_UUID = crypto.randomUUID();
process.env.INSTANCE_UUID = process.env.INSTANCE_UUID || INSTANCE_UUID;

console.log(`[boot] role=${process.env.ROLE} service=${process.env.GAE_SERVICE} port=${process.env.PORT} instance=${process.env.INSTANCE_UUID}`);

const app = express();
let ready = false;

app.get('/livez', (_req, res) => res.status(200).send('ok'));
app.get('/healthz', (_req, res) => ready ? res.status(200).send('ok') : res.status(503).send('starting'));

const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, '0.0.0.0', () => console.log(`[worker] health on ${PORT}`));

const WAITING_CHILD_SWEEP_LIMIT = Number(process.env.WCHILD_SWEEP_LIMIT || 5);
const WAITING_CHILD_SWEEP_DELAY_MS = Number(process.env.WCHILD_SWEEP_DELAY_MS || 10000);

// graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutdown requested');
  try { if (global.__queueSweepOnExit) await global.__queueSweepOnExit(); } catch (e) { console.error(e); }
  try { if (global.__workerClose) await global.__workerClose(); } catch (e) { console.error(e); }
  process.exit(0);
});

(async () => {
  try {
    // lazy-import heavy modules so require-time work doesn’t block healthz
    console.log(`Main worker service connecting to mongoose`)
    const mongoose = (await import('mongoose')).default;
    mongoose.set('strictQuery', false);

    await mongoose.connect(process.env.MONGOOSE_URL, {
        compressors: 'zstd'
    })

    const { SIO } = await import('../socket.js');
    const { getQueue }                 = await import('../queue_registry.js');
    /*const { default: QueueDocument }   = await import('../document_queue.js');
    const { default: QueueAI }         = await import('../ai_queue.js');
    const { default: EnrichPrimitive } = await import('../enrich_queue.js');
    const { default: QueryQueue }      = await import('../query_queue.js');
    const { default: BrightDataQueue } = await import('../brightdata_queue.js');
    const { default: FlowQueue }       = await import('../flow_queue.js');*/

    const QueueDocument = await getQueue( "document")
    const QueueAI = await getQueue( "ai")
    const EnrichPrimitive = await getQueue( "enrich")
    const QueryQueue = await getQueue( "query")
    const BrightDataQueue = await getQueue( "brightdata")
    const FlowQueue = await getQueue( "flow")

    // Any side-effect module goes last
    await import('../action_register.js');

    // If your emitter can take an existing client, pass it;
    // otherwise SIO can do redis.duplicate() internally.
    const redis = getRedisBase()
    SIO.initEmitter();

    
    // Instantiate queues with the SAME redis client
    QueueAI.myInit();
    EnrichPrimitive.myInit();
    QueryQueue.myInit();
    BrightDataQueue.myInit();
    FlowQueue.myInit();
    QueueDocument.myInit();

    // Subscribe for cross-service queue control (watch/stop)
    const CONTROL_CHANNEL = 'queue:control';
    const { pub, sub } = await getPubSubClients();
    await sub.subscribe(CONTROL_CHANNEL, async (raw) => {
      try {
        const msg = JSON.parse(raw || '{}');
        if (!msg?.cmd) return;
        if (msg?.sourceId && msg.sourceId === process.env.INSTANCE_UUID) {
          // Ignore self-originated messages
          return;
        }
        const type = msg.queueType;

        if (msg.cmd === 'sweep-wchildren') {
          const targetTypes = Array.isArray(msg.queueTypes) && msg.queueTypes.length > 0
            ? msg.queueTypes
            : (type ? [type] : []);
          if (targetTypes.length === 0) return;
          const queueNames = msg.queueName ? [msg.queueName] : undefined;
          const limitPerQueue = msg.limitPerQueue ? Number(msg.limitPerQueue) : undefined;
          const reason = msg.reason ? `${msg.reason}:remote` : 'control';
          const delayMs = Number(msg.delayMs || 0);

          const runSweep = async () => {
            for (const qt of targetTypes) {
              try {
                const q = await getQueue(qt);
                const qm = q?._queue;
                if (!qm || typeof qm.sweepWaitingChildrenQueues !== 'function') continue;
                await qm.sweepWaitingChildrenQueues({ reason, queueNames, limitPerQueue });
              } catch (err) {
                console.error(`[worker] sweep-wchildren error for ${qt}`, err);
              }
            }
          };

          if (delayMs > 0) {
            setTimeout(() => {
              runSweep().catch(err => console.error('[worker] delayed sweep error', err));
            }, delayMs);
          } else {
            await runSweep();
          }
          return;
        }

        const name = msg.queueName;
        const workspaceId = msg.workspaceId || (name ? String(name).split('-')[0] : undefined);
        if (!type || !workspaceId) return;

        // Ensure the target queue is loaded
        const q = await getQueue(type);
        const qm = q?._queue;
        if (!qm) return;

        const threads = qm.workerThreads || [];
        if (msg.cmd === 'watch') {
          console.log(`[worker] watch ${name} to ${threads.length} threads (${type}) via ${CONTROL_CHANNEL}`);
          if (threads.length > 0) {
            for (const t of threads) {
              try { t.postMessage({ type: 'watch', queueName: name }); } catch {}
            }
          }
        } else if (msg.cmd === 'stop') {
          console.log(`[worker] stop ${name} to ${threads.length} threads (${type}) via ${CONTROL_CHANNEL}`);
          // Instruct local worker threads to stop watching
          if (threads.length > 0) {
            for (const t of threads) {
              try { t.postMessage({ type: 'stop', queueName: name }); } catch {}
            }
          }
          // Mirror-only local cleanup (do not purge BullMQ here)
          try { await qm.mirrorStop(workspaceId, name); } catch {}
        }
      } catch (e) {
        console.error('[worker] control message error', e);
      }
    });

    // expose a unified close for SIGTERM
    global.__gracefulClose = async () => {
      try { await sub.unsubscribe(CONTROL_CHANNEL); } catch {}
      try { await sub.quit(); } catch {}
      try { await pub.quit(); } catch {}
      try { await redis.quit(); } catch {}
    };
    global.__workerClose = global.__gracefulClose;

    ready = true;
    console.log('[worker] initialized, ready');

    // Heartbeat: log main-thread queues and request thread reports
    const queues = [QueueDocument, QueueAI, EnrichPrimitive, QueryQueue, BrightDataQueue, FlowQueue].filter(Boolean);
    const queueTypesForSweep = queues.map(inst => inst?.queueName).filter(Boolean);

    async function publishWaitingChildrenSweep(reason, delayMs = WAITING_CHILD_SWEEP_DELAY_MS) {
      try {
        if (queueTypesForSweep.length === 0) {
          return;
        }
        const payload = {
          cmd: 'sweep-wchildren',
          queueTypes: queueTypesForSweep,
          reason,
          delayMs,
          limitPerQueue: WAITING_CHILD_SWEEP_LIMIT,
          source: process.env.GAE_SERVICE || process.env.ROLE || 'worker',
          sourceId: process.env.INSTANCE_UUID,
        };
        await pub.publish(CONTROL_CHANNEL, JSON.stringify(payload));
        console.log(`[worker] published sweep-wchildren (${reason}) for types ${queueTypesForSweep.join(',')}`);
      } catch (err) {
        console.error('[worker] failed to publish waiting-children sweep request', err);
      }
    }

    global.__queueSweepOnExit = async () => {
      try {
        for (const inst of queues) {
          const qm = inst?._queue;
          if (!qm || typeof qm.sweepWaitingChildrenQueues !== 'function') continue;
          await qm.sweepWaitingChildrenQueues({ reason: 'sigterm-local', limitPerQueue: WAITING_CHILD_SWEEP_LIMIT });
        }
      } catch (err) {
        console.error('[worker] local waiting-children sweep error', err);
      }
      await publishWaitingChildrenSweep('sigterm', WAITING_CHILD_SWEEP_DELAY_MS);
    };

    async function logMainQueuesHeartbeat() {
      try {
        console.log(`[hb] main instance=${process.env.INSTANCE_UUID}`);
        for (const inst of queues) {
          const qm = inst?._queue;
          if (!qm) continue;
          for (const [name, bullq] of Object.entries(qm.queues || {})) {
            try {
              const c = await bullq.getJobCounts('waiting','active','waiting-children','delayed','failed','completed');
              console.log(`[hb] main ${name} waiting=${c.waiting||0} active=${c.active||0} wchildren=${c['waiting-children']||0} delayed=${c.delayed||0} failed=${c.failed||0} completed=${c.completed||0}`);
            } catch (e) {
              console.log(`[hb] main ${name} error ${e?.message || e}`);
            }
          }
          // Request thread heartbeats for this queue type
          for (const t of qm.workerThreads || []) {
            try { t.postMessage({ type: 'heartbeat' }); } catch {}
          }
          try {
            await qm.sweepWaitingChildrenQueues({ reason: 'worker-heartbeat', limitPerQueue: WAITING_CHILD_SWEEP_LIMIT });
          } catch (sweepError) {
            console.log(`[hb] sweep error ${inst?.queueName || 'unknown'} ${sweepError?.message || sweepError}`);
          }
        }
      } catch (e) {
        console.log('[hb] main error', e?.message || e);
      }
    }
    const HEARTBEAT_MS = Number(process.env.WORKER_HEARTBEAT_MS || 30000);
    setInterval(() => { logMainQueuesHeartbeat(); }, HEARTBEAT_MS);
  } catch (err) {
    console.error('[worker] startup error', err);
    // keep readiness=503 so Flex replaces this instance
    // or uncomment to fail fast: process.exit(1);
  }
})();
