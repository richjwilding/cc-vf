import BaseQueue from './base_queue';
import { getLogger } from './logger.js';
import { fetchPrimitive, dispatchControlUpdate } from './SharedFunctions.js';
import { syncExternalPrimitive } from './integrations/index.js';

const logger = getLogger('integration_queue', 'debug');

let instance;

export async function processQueue(job, cancelCheck) {
  return IntegrationQueue().process(job, cancelCheck);
}

class IntegrationQueueClass extends BaseQueue {
  constructor() {
    super('integration', undefined, 2);
  }

  async enqueueSync(primitive, options = {}) {
    const field = options.field ?? 'processing.integration.sync';
    if (primitive.processing?.integration?.sync?.status === 'pending') {
      logger.info(`Sync already pending for external primitive ${primitive.id}`);
      return false;
    }
    const data = {
      id: primitive.id ?? primitive._id?.toString?.(),
      mode: 'sync',
      field,
      options: {
        provider: options.provider,
        accountId: options.accountId,
        since: options.since,
      },
    };
    await this.addJob(primitive.workspaceId, data, options.jobOptions);
    return true;
  }

  async process(job, cancelCheck) {
    if (job.data.mode !== 'sync') {
      throw new Error(`Unknown integration queue mode: ${job.data.mode}`);
    }
    const primitiveId = job.data.id;
    const primitive = await fetchPrimitive(primitiveId);
    if (!primitive) {
      throw new Error(`Primitive ${primitiveId} not found`);
    }
    const field = job.data.field ?? 'processing.integration.sync';

    dispatchControlUpdate(primitive.id, field, {
      status: 'running',
      started: new Date().toISOString(),
      track: primitive.id,
    });

    try {
      const result = await syncExternalPrimitive(primitive, job.data.options ?? {});
      dispatchControlUpdate(primitive.id, field, {
        status: 'complete',
        completed: new Date().toISOString(),
        track: primitive.id,
        summary: result,
      });
      logger.info(`External sync complete for ${primitive.id}`, result);
      return result;
    } catch (error) {
      logger.error(`External sync failed for ${primitive.id}`, error);
      dispatchControlUpdate(primitive.id, field, {
        status: 'error',
        error: error.message,
        completed: new Date().toISOString(),
        track: primitive.id,
      });
      throw error;
    }
  }
}

export default function IntegrationQueue() {
  if (!instance) {
    instance = new IntegrationQueueClass();
    instance.myInit();
  }
  return instance;
}
