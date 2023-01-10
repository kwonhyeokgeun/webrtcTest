const express = require('express');
const app = express();
const https = require('https');
const wrtc = require('wrtc');
const fs = require('fs');


const options = {
    key: fs.readFileSync('./keys/privkey.pem'),
    cert: fs.readFileSync('./keys/cert.crt')
};

const server = https.createServer(options, app).listen(443, () => {
    console.log("Create HTTPS Server");
});

const io = require('socket.io')(server,{
    cors: {
        origin: "*",
      }
});



let meetingRooms = {}; //key는 roomId, {socketId:1, username:a}
let meetingLeaders={};

let sendPCs = {
    'meeting':{},
    'present':{},
    'share':{}
};

let receivePCs = {
    'meeting':{},
    'present':{},
    'share':{}
};

let userStreams = {};
let shareStreams = {};
let presentStreams = {};//?
let numOfUsers = {};



io.on('connection', function(socket) {
    console.log("connection");

    socket.on('meetingRoomInfo', (data) => {
        console.log('meetingRoomInfo');
        console.log(socket.id)
        let roomId=data.roomId;
        try{
            if(meetingRooms[roomId]==undefined){
                meetingRooms[roomId]={}
                meetingLeaders[roomId]=data.name;
                socket.emit('meetingRoomInfo',{
                    numOfUsers:0,
                    roomLeader: data.name,
                })
            }else{
                socket.emit('meetingRoomInfo',{
                    numOfUsers:meetingRooms[roomId].length,
                    roomLeader: meetingLeaders[roomId],
                })
            }
        }catch{
            console.log("erroer")
        }
    });

    //방에 처음 접속한 user에게 접속하고 있었던 user들의 정보를 제공하는 역할
    socket.on("meetingJoinRoom", async (message) => {
        joinRoomHandler[message.purpose](message, socket);
        /*if(shareSwitch[message.roomId]==true){
            shareJoinRoomHandler(message,socket);
        }*/
    });    



    function meetingJoinRoomHandler(message, socket) {
        console.log('meeting room:',message.roomId,',',message.userName );
        try {
            let rows = [];
            for(var key in meetingRooms[message.roomId]) {
                rows.push({
                    user_name: users[key]['user_name'],
                    stream : userStreams['meeting'][key]
                });
            }
            if(rows.length !== 0) {
                socket.emit("all_users", { 
                    users: rows,
                    oneoneUserId: oneoneUserId[message.roomId]
                });
            }else{
                io.to(message.senderSocketId).emit("myId");
                console.log("@@@@@@@@@@@@@@@@@@@@@");
            }
            socket.join(message.roomId);
            roomList[message.roomId][message.senderSocketId] = 1;
            users[message.senderSocketId] = {
                user_name: message.userName,
                room_id: message.roomId,
            };
            console.log('user in:',users)
        } catch (error) {
            console.error(error);
        }
    }
})