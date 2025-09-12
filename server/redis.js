// lib/redis.js
import { createClient } from "redis";

let base;
export function getRedisBase(name) {
  if (!base) {
    base = createClient({
      socket: {
        host: process.env.QUEUES_REDIS_HOST,
        port: Number(process.env.QUEUES_REDIS_PORT),
        connectTimeout: 15000,
        reconnectStrategy: r => Math.min(r * 1000, 10000),
      },
      // password: process.env.QUEUES_REDIS_PASSWORD, // if needed
      // username: process.env.QUEUES_REDIS_USERNAME, // if needed
    });
    console.log(`[redis] connecting for ${(name ?? "main thread")} on ${process.env.QUEUES_REDIS_HOST}:${process.env.QUEUES_REDIS_PORT}`)
    base.on("error", (e) => console.error("[redis] error for " + (name ?? "main thread"), e.message));
    base.on("connect", () => console.log("[redis] socket connected for" + (name ?? "main thread"))); // TCP socket opened
    base.on("ready", () => console.log("[redis] client ready for " + (name ?? "main thread")));       // AUTH + PING successful
    base.connect().catch((e) => {
      console.error("[redis] connect failed", e);
      process.exit(1);
    });
  }
  return base;
}

export async function getPubSubClients() {
  const pub = getRedisBase().duplicate();
  const sub = getRedisBase().duplicate();
  await Promise.all([pub.connect(), sub.connect()]);
  return { pub, sub };
}