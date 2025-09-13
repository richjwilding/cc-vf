// sio.js
import mongoose from "mongoose";
import { Server } from "socket.io";
import { parentPort, isMainThread } from "worker_threads";
import { getRedisBase, getPubSubClients } from "./redis.js";
import { createAdapter } from "@socket.io/redis-adapter";
import { Emitter } from "@socket.io/redis-emitter";

let io;
let authentication;
let emitter;

export const SIO = {
  // WEB PROCESS ONLY — attach to your HTTP server
  init: async function (server) {
    if (!isMainThread) {
      throw new Error("Cannot initialize socket.io server in a worker thread.");
    }

    io = new Server(server, {
      cors: {
        origin: process.env.CORS_ORIGIN || "http://localhost:3000",
        credentials: true,
      },
    });

    // Use shared Redis base, but adapter needs dedicated pub/sub
    const { pub, sub } = await getPubSubClients();
    io.adapter(createAdapter(pub, sub));

    console.log(`[SIO] server registered; using redis ${process.env.QUEUES_REDIS_HOST}:${process.env.QUEUES_REDIS_PORT}`);

    this._attemptStartup();
    return io;
  },

  setAuthentication: function (callback) {
    if (authentication) return;
    authentication = callback;
    this._attemptStartup();
  },

  initEmitter: function () {
    const pub = getRedisBase().duplicate();
    emitter = new Emitter(pub);
    pub.connect().catch((e) => console.error("[SIO] emitter connect error", e));
    console.log(`[SIO] emitter registered via redis ${process.env.QUEUES_REDIS_HOST}:${process.env.QUEUES_REDIS_PORT}`);
    return emitter;
  },

  _attemptStartup: function () {
    if (!io) {
      console.log("[SIO] waiting for io");
      return;
    }
    if (!authentication) {
      console.log("[SIO] waiting for auth");
      return;
    }
    // correct middleware API
    io.engine.use(authentication);

    io.on("connection", (socket) => {
      const userId = socket.request?.session?.passport?.user;
      socket.join(`user:${userId}`);
      socket.emit("control", { needLogin: userId === undefined });

      socket.on("room", (room) => {
        console.log(`[SIO] user ${userId} join ${room}`);
        socket.join(room);
      });
    });
  },

  async notifyUsers(userIds, data) {
    for (const userId of userIds) {
      await this.sendNotificationToSocket(`user:${userId}`, data);
    }
  },

  notifyPrimitiveEvent(primitive_or_workspace, data) {
    const workspaceId = primitive_or_workspace?.workspaceId || primitive_or_workspace;
    this.sendNotificationToSocket(workspaceId, data);
  },

  async sendNotificationToSocket(room, data) {
    // serialize Mongoose docs/ObjectIds to plain JSON
    const serializeIfNeeded = (obj) => {
      if (!obj || typeof obj !== "object") return obj;
      if (obj instanceof mongoose.Types.ObjectId) return obj.toString();
      if (typeof obj.toObject === "function") return serializeIfNeeded(obj.toObject());
      if (Array.isArray(obj)) return obj.map(serializeIfNeeded);
      const out = {};
      for (const [k, v] of Object.entries(obj)) out[k] = serializeIfNeeded(v);
      return out;
    };

    data = Array.isArray(data) ? data.map(serializeIfNeeded) : serializeIfNeeded(data);

    if (isMainThread) {
      // Web server process
      if (emitter) {
        emitter.to(room).emit("message", data);
      }else{
        io?.to(room).emit("message", data);
      }
    } else if (parentPort) {
      // Fallback for worker_threads inside same process (if you still use them)
      parentPort.postMessage({
        type: "sendNotificationToSocket",
        data: { room, message: JSON.stringify(data) },
      });
    } else {
      console.error("[SIO] No emitter available to send", room);
    }
  },

  getIO() {
    if (!io || !authentication) {
      throw new Error("Can't get io instance before calling .init() and .setAuthentication()");
    }
    return io;
  },
};