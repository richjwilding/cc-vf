import mongoose from "mongoose";
import { Server } from "socket.io";
import { parentPort, isMainThread } from "worker_threads";
const redisAdapter = require('socket.io-redis');


let io;
let authentication
export const SIO = {
   init: function(server) {
    if (!isMainThread) {
        throw new Error("Cannot initialize socket.io in a worker thread.");
      }

       io = new Server(server,{
        cors: {
            origin: "http://localhost:3000",
            credentials: true
          },
       });
       console.log(`registered socket`)
       this.attemptStartup()
       io.adapter(redisAdapter({
            host: process.env.QUEUES_REDIS_HOST, 
            port: process.env.QUEUES_REDIS_PORT
        ,
       }));
       console.log(`Using redis to sync ${process.env.QUEUES_REDIS_HOST}:${process.env.QUEUES_REDIS_PORT}`)


       return io;
   },
   setAuthentication:function(callback){
    if( authentication ){return}
        authentication = callback
        this.attemptStartup()
   },
   attemptStartup:function(){
    if (!io ) {
        console.log(`await for io`)
        return
    }
    if (!authentication ) {
        console.log(`await for auth`)
        return

    }
    io.engine.use(authentication)

    io.on("connection", function(socket){
        var userId = socket.request.session?.passport?.user;
        
        socket.emit("control", {needLogin: userId === undefined})
        socket.on('room', function(room) {
            console.log(`changing room to ${room}`)
            socket.join(room);
        });
    });
   },
   notifyPrimitiveEvent: function (primitive_or_workspace, data) {
      let workspaceId;
      if (primitive_or_workspace?.workspaceId) {
        workspaceId = primitive_or_workspace.workspaceId;
      } else {
        workspaceId = primitive_or_workspace;
      }

    const serializeIfNeeded = (obj) => {
        if (!obj || typeof obj !== 'object') {
          return obj; // Return non-object values as is
        }
      
        if (obj instanceof mongoose.Types.ObjectId) {
          return obj.toString();
        }
      
        if (typeof obj.toObject === 'function') {
          const plainObject = obj.toObject();
          return serializeIfNeeded(plainObject); // Recursively process the plain object
        }
      
        if (Array.isArray(obj)) {
          return obj.map((item) => serializeIfNeeded(item));
        }
      
        const serializedObject = {};
        for (const [key, value] of Object.entries(obj)) {
          serializedObject[key] = serializeIfNeeded(value);
        }
      
        return serializedObject;
      };
    if( Array.isArray(data) ){
        data = data.map(d=>serializeIfNeeded(d))
    }else{
        data = serializeIfNeeded(data)
    }

    if (isMainThread) {
      io.to(workspaceId).emit("message", data);
    } else {
      if (!parentPort) {
        console.error(
          "[SIO] Cannot forward notifyPrimitiveEvent: parentPort is not available."
        );
        return;
      }
      
      try{

          parentPort.postMessage({
              type: "notifyPrimitiveEvent",
              data: {
                  workspaceId,
                  message: JSON.stringify(data),
                },
            });
        }catch(e){
            console.log(e)
        }
    }
  },
   getIO: function() {
       if (!io || !authentication) {
          throw new Error("Can't get io instance before calling .init()");
       }
       return io;
   }
}
