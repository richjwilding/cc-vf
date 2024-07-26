import { Server } from "socket.io";
const redisAdapter = require('socket.io-redis');


let io;
let authentication
export const SIO = {
   init: function(server) {
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
   notifyPrimitiveEvent: function(primitive_or_workspace, data){
    let workspaceId
    if( primitive_or_workspace?.workspaceId ){
        workspaceId = primitive_or_workspace.workspaceId
    }else{
        workspaceId = primitive_or_workspace
    }
    io.to(workspaceId).emit("message", data)

   },
   getIO: function() {
       if (!io || !authentication) {
          throw new Error("Can't get io instance before calling .init()");
       }
       return io;
   }
}
