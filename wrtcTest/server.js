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

let shareUsers={}; //shareUsers[roomId]=socketId

let sendPCs = { //sendPCs[purpose][senderSocketId][receiverSocketId]= pc
    "user":{},
    "share":{}
}; 
let receivePCs = { //receivePCs[purpose][socketId]=pc
    "user":{},
    "share":{}
}; 

let streams = {
    "user":{},
    "share":{}
}; //streams[purpose][roomId][socketId]=stream  //받는 pc만?

const pc_config = {
    iceServers: [
        // {
        //   urls: 'stun:[STUN_IP]:[PORT]',
        //   'credentials': '[YOR CREDENTIALS]',
        //   'username': '[USERNAME]'
        // },
        {
            urls: "stun:edu.uxis.co.kr"
        },
        {
            urls: "turn:edu.uxis.co.kr?transport=tcp",
                    "username": "webrtc",
                    "credential": "webrtc100!"
        }
    ],
}


io.on('connection', function(socket) {
    console.log("connection");

    socket.on('meeting_room_info', (data) => {
        let roomId=data.roomId;
        try{
            if(meetingRooms[roomId]==undefined){  //내가 처음
                meetingRooms[roomId]=[]
                //meetingLeaders[roomId]=data.name;    
                numOfUsers[roomId]=0;
            }
            
            socket.emit('meeting_room_info',{  //현재방 유저수 전달
                numOfUsers:meetingRooms[roomId].length,
                //roomLeader: meetingLeaders[roomId],
            })        
        }catch{
            console.log("erroer")
        }
    });

    //방에 처음 접속한 user에게 접속하고 있었던 user들의 정보를 제공하는 역할및 join room해줌
    socket.on("meeting_join_room", async (data) => {
        meetingJoinRoomHandler(data, socket);

        /*if(shareSwitch[message.roomId]==true){
            shareJoinRoomHandler(message,socket);
        }*/
    });    


    //클라이언트 -> 서버 peerConnection offer
    socket.on("sender_offer", async (data) => {
        try {
            var offer = data.offer;
            var socketId = socket.id;
            var roomId = data.roomId;
            var userName = data.userName;
            
            let pc = createReceiverPeerConnection(socket, roomId, userName, data.purpose);
            let answer = await createReceiverAnswer(offer, pc); //offer에 대한 응답

            await io.to(socketId).emit("get_sender_answer", {   
                answer,
                purpose: data.purpose,
            });
        } catch (error) {
            console.error(error);
        }
    });

    //클라이언트 <- 서버 peerConnection offer
    socket.on("receiver_offer", async (data) => {
        try {
            let offer = data.offer;
            let purpose = data.purpose;
            let senderSocketId = data.senderSocketId;
            let receiverSocketId = data.receiverSocketId;
            let roomId = data.roomId;

            let pc = createSenderPeerConnection(
                receiverSocketId,
                senderSocketId,
                purpose,
                roomId
            );
            let answer = await createSenderAnswer(offer, pc); 
            
            await io.to(receiverSocketId).emit("get_receiver_answer", { 
                id: senderSocketId,
                purpose: purpose,
                answer,
            });
        } catch (error) {
            console.error(error);
        }
    });

    //클라이언트 -> 서버 candidate
    socket.on("sender_candidate", (data) => {
        try {
            let pc = receivePCs[data.purpose][socket.id];
            if(!data.candidate) return;
            if(!pc) return;
            pc.addIceCandidate(new wrtc.RTCIceCandidate(data.candidate));
        } catch (error) {
            console.error(error);
        }
    });

    //클라이언트 <- 서버 candidate
    socket.on("receiver_candidate", (data) => {
        try {
            if(!data.candidate) return;
            let pc = sendPCs[data.purpose][data.senderSocketId][data.receiverSocketId];
            pc.addIceCandidate(new wrtc.RTCIceCandidate(data.candidate));
        } catch (error) {
            console.error(error);
        }
    });


    socket.on("user_disconnect", (data) => {
        console.log(data.roomId,"방의 ",data.userName,"이 나감!")
        try{
            let roomId = data.roomId;
            let userName = data.userName;
            let socketId = socket.id;

            socket.broadcast.to(roomId).emit("user_exit", { 
                socketId: socketId,
                userName: userName,
            });

            //화면공유 중이면 공유끊는 작업 추가 하기!!

            
            for(let i=meetingRooms[roomId].length-1; i>=0; i--){
                if(meetingRooms[roomId][i] == socketId){
                    delete meetingRooms[roomId][i];
                }else{
                    let otherSocketId = meetingRooms[roomId][i]; 
                    sendPCs['user'][socketId][otherSocketId].close();
                    sendPCs['user'][otherSocketId][socketId].close();
                    delete sendPCs['user'][otherSocketId][socketId];
                }
            }
            delete sendPCs['user'][socketId];

            receivePCs['user'][socketId].close();
            delete receivePCs['user'][socketId];
            delete userNames[socketId]; 

            socket.leave(roomId)

        }catch(e){
            console.error(e)
        }

    });

    //현재 room에 화면공유가 가능한지
    socket.on("share_check", (data) => {
        let roomId = data.roomId;
        if(shareUsers[roomId]===undefined){
            socket.emit("share_ok");
        }
    });
    
    socket.on('share_disconnect', (data) => {
        console.log('share disconnect');
        let roomId=data.roomId;
        try{
            if(shareUsers[roomId] != socket.id) return;
            delete shareUsers[roomId]

            receivePCs['share'][socket.id].close();
            delete receivePCs['share'][socket.id];

            for(let i=meetingRooms[roomId].length-1; i>=0; i--){
                if(meetingRooms[roomId][i] !== socket.id){
                    let otherSocketId = meetingRooms[roomId][i]; 
                    sendPCs['share'][socket.id][otherSocketId].close();
                }
            }
            delete sendPCs['share'][socket.id];

            socket.broadcast.to(roomId).emit('share_disconnect',{id:socket.id});
        }
        catch(e){
            console.error(e);
        }

    });


    function meetingJoinRoomHandler(data, socket) {
        roomId=data.roomId;
        try {
            var users=[];
            for(let i in meetingRooms[roomId]){
                let otherSocketId= meetingRooms[roomId][i];
                users.push(
                    {
                        socketId: otherSocketId,
                        userName:userNames[otherSocketId],
                        stream: streams['user'][roomId][otherSocketId]
                    }
                )
            }
            socket.emit("all_users", { //같은 방 유저의 socketId와 userName 전달, 클라이언트는 받을 pc를 생성하게됨
                users: users,
            });
        

            socket.join(roomId); //방에 join

            meetingRooms[roomId].push(socket.id)
            userNames[socket.id]=data.userName;
            numOfUsers[roomId]++;
            console.log(data.userName, "가  ",roomId,"방에 join함 id:",socket.id);

        } catch (error) {
            console.error(error);
        }
    }

    //클라이언트의 영상 수신용 pc 생성
    function createReceiverPeerConnection(socket, roomId, userName, purpose) {
        let pc = new wrtc.RTCPeerConnection(pc_config);

        receivePCs[purpose][socket.id] = pc;

        pc.onicecandidate = (e) => {
            if(!e.candidate) return;
            socket.emit("get_sender_candidate", { 
                candidate: e.candidate,
                purpose: purpose,
            });
        }
    
        pc.oniceconnectionstatechange = (e) => {
            //console.log(e);
        }
        var once_ontrack=1
        pc.ontrack = (e) => {
            if(once_ontrack==1){ //video, audio로 두번하므로 한번만 하도록  ??
                //해당 방 사람들에게 알려줌
                if(purpose=='user'){ 
                    meetingOntrackHandler(e.streams[0], socket, roomId, userName);
                }
                else if(purpose=='share'){
                    shareOntrackHandler(e.streams[0], socket, roomId, userName)
                }
            }
            once_ontrack+=1;
        }
        return pc;
    }

    //
    function createSenderPeerConnection(receiverSocketId, senderSocketId, purpose, roomId) {
        let pc = new wrtc.RTCPeerConnection(pc_config);

        if(!sendPCs[purpose][senderSocketId]){
            sendPCs[purpose][senderSocketId] = {};
        }
        sendPCs[purpose][senderSocketId][receiverSocketId]=pc

        let stream;
        stream = streams[purpose][roomId][senderSocketId];

        pc.onicecandidate = (e) => {
            if(e.candidate) {
                io.to(receiverSocketId).emit("get_receiver_candidate", { 
                    id: senderSocketId,
                    candidate: e.candidate,
                    purpose: purpose,
                });
            }
        }
    
        pc.oniceconnectionstatechange = (e) => {
            //console.log(e);
        }
        
        //전송용 pc에 stream 넣어주는듯
        stream.getTracks().forEach((track => {
            pc.addTrack(track, stream);
        }));
    
        return pc;
    }

    //들어온 유저 stream 저장 후, 같은방 유저에게 새 유저 접속을 알림
    function meetingOntrackHandler(stream, socket, roomId, userName) {
        /*
        if(ontrackSwitch) {
            ontrackSwitch = false;
            return;
        }
        */
       
        if(!streams['user'][roomId]) streams['user'][roomId]={}
        streams['user'][roomId][socket.id]=stream  //유저의 stream 변수에 저장

        socket.broadcast.to(roomId).emit("user_enter", { //해당 유저가 들어옴을 알려줌
            socketId: socket.id,
            roomId: roomId,
            userName: userName,
            purpose: 'user',
        });

        return;
    }

        //시작된 화면공유 stream 저장 후 같은방 사람에게 화면공유 시작을 알려줌
        function shareOntrackHandler(stream, socket, roomId, userName) {

            if(!streams['share'][roomId]) streams['share'][roomId]={}
            streams['share'][roomId][socket.id]=stream  //화면공유 stream을 변수에 저장
            shareUsers[roomId]=socket.id;

            socket.broadcast.to(roomId).emit('share_request', {
                userName: userName,
                socketId: socket.id,
            });

            return;
        }

    async function createReceiverAnswer(offer, pc) {
        try {
            await pc.setRemoteDescription(offer);
            let answer = await pc.createAnswer({ //수신은 true로
                offerToReceiveAudio: true,
                offerToReceiveVideo: true,
            });
            await pc.setLocalDescription(answer);
    
            return answer;
        } catch(err) {
            console.error(err);
        }
    }

    async function createSenderAnswer(offer, pc) {
        try {
            await pc.setRemoteDescription(offer);
            let answer = await pc.createAnswer({
                offerToReceiveAudio: false,
                offerToReceiveVideo: false,
            });
            await pc.setLocalDescription(answer);
    
            return answer;
        } catch(err) {
            console.error(err);
        }
    }
    
})