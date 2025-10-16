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
let shuttingDown = false;
const FORCE_EXIT_DELAY_MS = Number(process.env.WORKER_FORCE_EXIT_MS || 30000);

app.get('/livez', (_req, res) => res.status(200).send('ok'));
app.get('/healthz', (_req, res) => ready ? res.status(200).send('ok') : res.status(503).send('starting'));

const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, '0.0.0.0', () => console.log(`[worker] health on ${PORT}`));

const WAITING_CHILD_SWEEP_LIMIT = Number(process.env.WCHILD_SWEEP_LIMIT || 5);
const WAITING_CHILD_SWEEP_DELAY_MS = Number(process.env.WCHILD_SWEEP_DELAY_MS || 10000);

// graceful shutdown
process.on('SIGTERM', () => {
  if (shuttingDown) {
    console.log('[worker] SIGTERM received but shutdown already in progress');
    return;
  }
  shuttingDown = true;
  ready = false;
  console.log('[worker] SIGTERM received — beginning graceful shutdown');

  const forceTimer = setTimeout(() => {
    console.error('[worker] forcing exit after shutdown grace period');
    process.exit(0);
  }, FORCE_EXIT_DELAY_MS);
  forceTimer.unref();

  (async () => {
    try {
      if (global.__announceQueueHandoff) {
        await global.__announceQueueHandoff('sigterm');
      }
    } catch (e) {
      console.error('[worker] error announcing queue handoff during shutdown', e);
    }
    try {
      if (global.__terminateWorkerThreads) {
        await global.__terminateWorkerThreads();
      }
    } catch (e) {
      console.error('[worker] error terminating worker threads during shutdown', e);
    }
    try {
      if (global.__queueSweepOnExit) {
        await global.__queueSweepOnExit();
      }
    } catch (e) {
      console.error('[worker] queue sweep on shutdown failed', e);
    }
    try {
      if (global.__workerClose) {
        await global.__workerClose();
      }
    } catch (e) {
      console.error('[worker] cleanup on shutdown failed', e);
    }
  })()
    .catch((err) => {
      console.error('[worker] unexpected shutdown error', err);
    })
    .finally(() => {
      clearTimeout(forceTimer);
      console.log('[worker] graceful shutdown complete');
      process.exit(0);
    });
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

    const QueueDocument = await getQueue( "document")
    const QueueAI = await getQueue( "ai")
    const EnrichPrimitive = await getQueue( "enrich")
    const QueryQueue = await getQueue( "query")
    const BrightDataQueue = await getQueue( "brightdata")
    const FlowQueue = await getQueue( "flow")
    const IntegrationQueue = await getQueue( "integration")

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
    IntegrationQueue.myInit();

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
    const queues = [QueueDocument, QueueAI, EnrichPrimitive, QueryQueue, BrightDataQueue, FlowQueue, IntegrationQueue].filter(Boolean);
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

    async function publishShutdownSummary(reason, reports) {
      if (!Array.isArray(reports) || reports.length === 0) {
        return;
      }
      const totals = { recovered: 0, inactive: 0, completed: 0, missing: 0, errors: 0 };
      for (const report of reports) {
        totals.recovered += Array.isArray(report.recovered) ? report.recovered.length : 0;
        totals.inactive += Array.isArray(report.inactive) ? report.inactive.length : 0;
        totals.completed += Array.isArray(report.completed) ? report.completed.length : 0;
        totals.missing += Array.isArray(report.missing) ? report.missing.length : 0;
        totals.errors += Array.isArray(report.errors) ? report.errors.length : 0;
      }
      const payload = {
        cmd: 'shutdown-summary',
        reason,
        reports,
        totals,
        timestamp: new Date().toISOString(),
        source: process.env.GAE_SERVICE || process.env.ROLE || 'worker',
        sourceId: process.env.INSTANCE_UUID,
      };
      await pub.publish(CONTROL_CHANNEL, JSON.stringify(payload));
      console.log(`[worker] published shutdown summary recovered=${totals.recovered} inactive=${totals.inactive} completed=${totals.completed} missing=${totals.missing} errors=${totals.errors}`);
    }

    async function terminateWorkerThreads() {
      const managers = queues
        .map((inst) => inst?._queue)
        .filter(Boolean);
      const seen = new Set();
      const exitPromises = [];
      const threadShutdownMs = Number(process.env.WORKER_THREAD_SHUTDOWN_TIMEOUT_MS || 10000);

      for (const manager of managers) {
        try {
          manager.shuttingDown = true;
        } catch {}
        const threads = Array.isArray(manager.workerThreads) ? manager.workerThreads.slice() : [];
        if (threads.length === 0) {
          continue;
        }
        console.log(`[worker] requesting ${threads.length} worker thread(s) for ${manager.type} to terminate`);
        threads.forEach((thread) => {
          if (!thread || seen.has(thread)) {
            return;
          }
          seen.add(thread);

          const shutdownPromise = new Promise((resolve) => {
            let settled = false;
            let timer;
            const cleanup = () => {
              if (settled) return;
              settled = true;
              if (timer) {
                clearTimeout(timer);
              }
              const idx = manager.workerThreads?.indexOf(thread);
              if (idx !== undefined && idx >= 0) {
                manager.workerThreads.splice(idx, 1);
              }
              resolve();
            };
            const forceTimeoutShutdown = async () => {
              if (settled) {
                return;
              }
              console.error(`[worker] timeout waiting for worker thread ${thread.threadId} (${manager.type}) to terminate`);
              try {
                if (typeof manager.forceRecoverWorkerThread === 'function') {
                  await manager.forceRecoverWorkerThread(thread, { reason: 'shutdown-timeout' });
                }
              } catch (recoveryErr) {
                console.error(`[worker] failed to recover jobs for thread ${thread.threadId} (${manager.type}) during timeout`, recoveryErr);
              }
              try {
                await thread.terminate();
              } catch (terminateErr) {
                console.error(`[worker] failed to force terminate worker thread ${thread.threadId} (${manager.type})`, terminateErr);
              }
              cleanup();
            };
            timer = setTimeout(() => {
              forceTimeoutShutdown().catch((err) => {
                console.error(`[worker] unexpected error during timeout cleanup for thread ${thread.threadId} (${manager.type})`, err);
                cleanup();
              });
            }, threadShutdownMs);
            timer.unref?.();

            thread.once('exit', (code) => {
              console.log(`[worker] worker thread ${thread.threadId} (${manager.type}) exited with code ${code}`);
              cleanup();
            });
            thread.once('error', (err) => {
              console.error(`[worker] worker thread ${thread.threadId} (${manager.type}) error during shutdown`, err);
              cleanup();
            });

            try {
              thread.postMessage({ type: 'terminate' });
            } catch (err) {
              console.error(`[worker] failed to send terminate to worker thread ${thread.threadId} (${manager.type})`, err);
              (async () => {
                try {
                  if (typeof manager.forceRecoverWorkerThread === 'function') {
                    await manager.forceRecoverWorkerThread(thread, { reason: 'terminate-send-failure' });
                  }
                } catch (recoveryErr) {
                  console.error(`[worker] failed to recover jobs after terminate-send failure for thread ${thread.threadId} (${manager.type})`, recoveryErr);
                }
                try {
                  await thread.terminate();
                } catch (terminateErr) {
                  console.error(`[worker] failed to force terminate thread ${thread.threadId} (${manager.type}) after send failure`, terminateErr);
                }
                cleanup();
              })().catch((asyncErr) => {
                console.error(`[worker] unexpected error handling terminate-send failure for thread ${thread.threadId} (${manager.type})`, asyncErr);
                cleanup();
              });
            }
          });

          exitPromises.push(shutdownPromise);
        });
      }

      if (exitPromises.length === 0) {
        console.log('[worker] no worker threads to terminate');
        return;
      }

      await Promise.all(exitPromises);
      console.log('[worker] worker threads terminated');

      const allReports = [];
      for (const manager of managers) {
        if (typeof manager.drainRecoveryReports === 'function') {
          const reports = manager.drainRecoveryReports() || [];
          if (reports.length > 0) {
            allReports.push(
              ...reports.map((report) => ({
                ...report,
                queueType: report?.queueType || manager.type,
              }))
            );
          }
        }
      }
      if (allReports.length > 0) {
        try {
          await publishShutdownSummary('sigterm', allReports);
        } catch (summaryErr) {
          console.error('[worker] failed to publish shutdown summary', summaryErr);
        }
      }
    }

    async function announceQueueHandoff(reason = 'sigterm') {
      try {
        const managers = queues
          .map((inst) => inst?._queue)
          .filter(Boolean);
        const announced = new Set();
        for (const manager of managers) {
          const queueNames = Object.keys(manager.queues || {});
          if (queueNames.length === 0) continue;
          for (const queueName of queueNames) {
            if (announced.has(queueName)) continue;
            announced.add(queueName);
            const workspaceId = queueName.split('-')[0];
            const payload = {
              cmd: 'watch',
              queueType: manager.type,
              queueName,
              workspaceId: String(workspaceId),
              reason: `${reason}:handoff`,
              source: process.env.GAE_SERVICE || process.env.ROLE || 'worker',
              sourceId: process.env.INSTANCE_UUID,
            };
            await pub.publish(CONTROL_CHANNEL, JSON.stringify(payload));
            console.log(`[worker] published watch handoff for ${queueName} (${manager.type})`);
          }
        }
      } catch (err) {
        console.error('[worker] failed to publish queue handoff', err);
      }
    }

    global.__terminateWorkerThreads = terminateWorkerThreads;
    global.__announceQueueHandoff = announceQueueHandoff;

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
