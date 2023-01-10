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



let meetingRooms = {}; //meetingRooms[roomId][0]=socketId 
let userNames={}; //userNames[socketId]="김민수"
let meetingLeaders={}; //meetingLeaders[roomId]=방장name
let numOfUsers = {}; //numOfUsers[roomId]=3

let sendPCs = {
    'meeting':{},  //key는 socketId, value는 pc
    'share':{}
};

let receivePCs = {
    'meeting':{},
    'share':{}
};

let userStreams = {}; //일단 쓰지말아보자
let shareStreams = {};




io.on('connection', function(socket) {
    console.log("connection");

    socket.on('meeting_room_info', (data) => {
        console.log('meeting_room_info');
        let roomId=data.roomId;
        try{
            if(meetingRooms[roomId]==undefined){  //내가 처음
                meetingRooms[roomId]=[]
                meetingLeaders[roomId]=data.name;    
                numOfUsers[roomId]=0;
            }
            
            socket.emit('meeting_room_info',{  //현재방 유저수와 방장 전달
                numOfUsers:meetingRooms[roomId].length,
                roomLeader: meetingLeaders[roomId],
            })        
        }catch{
            console.log("erroer")
        }
    });

    //방에 처음 접속한 user에게 접속하고 있었던 user들의 정보를 제공하는 역할및 join room해줌
    socket.on("meeting_join_room", async (message) => {
        meetingJoinRoomHandler(message, socket);
        /*if(shareSwitch[message.roomId]==true){
            shareJoinRoomHandler(message,socket);
        }*/
    });    



    function meetingJoinRoomHandler(message, socket) {
        console.log('meeting room:',message.roomId,',',message.userName );
        roomId=message.roomId;
        try {
            var users=[];
            for(let otherSocketId in meetingRooms[roomId]){
                //console.log("otherSocketId:",otherSocketId)
                users.push(
                    {
                        socketId:otherSocketId, 
                        userName:userNames[otherSocketId],
                    }
                )
            }
            socket.emit("all_users", { //같은 방 유저의 socketId와 userName 전달, 클라이언트는 받을 pc를 생성하게됨
                users: meetingRooms[roomId],
            });
        

            socket.join(roomId); //방에 join

            meetingRooms[roomId].push(socket.id)
            userNames[socket.id]=message.userName;
            numOfUsers[roomId]++;
            console.log(message.userName, "가  ",roomId,"방에 join함")

        } catch (error) {
            console.error(error);
        }
    }
})