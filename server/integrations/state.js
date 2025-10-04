import { randomBytes } from 'node:crypto';
import { getRedisBase } from '../redis.js';

const STATE_PREFIX = 'integration:state:';
const DEFAULT_TTL_SECONDS = 10 * 60;

export async function createIntegrationState(payload, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const state = randomBytes(16).toString('hex');
  const client = getRedisBase('integration-state');
  await client.setEx(`${STATE_PREFIX}${state}`, ttlSeconds, JSON.stringify({
    ...payload,
    createdAt: new Date().toISOString(),
  }));
  return state;
}

export async function consumeIntegrationState(state) {
  if (!state) {
    return null;
  }
  const client = getRedisBase('integration-state');
  const key = `${STATE_PREFIX}${state}`;
  const json = await client.get(key);
  if (!json) {
    return null;
  }
  await client.del(key);
  try {
    return JSON.parse(json);
  } catch (error) {
    return null;
  }
}
