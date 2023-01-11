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

let sendPCs = {}; //sendPCs[senderSocketID]=[{id:receiverSocketID, pc:pc}]
let receivePCs = {}; //receivePCs[socketId]=pc

let streams = {}; //streams[roomId][socketId]=stream  //받는 pc만?





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

            receivePCs[data.purpose][socketId] = pc;

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
            let senderSocketId = messadatage.senderSocketId;
            let receiverSocketId = data.receiverSocketId;
            let roomId = data.roomId;
            

            let pc = createSenderPeerConnection(
                receiverSocketId,
                senderSocketId,
                purpose,
                roomId
            );
            let answer = await createSenderAnswer(offer, pc); // 이후 미완성

            if(!sendPCs[purpose][senderSocketId]){
                sendPCs[purpose][senderSocketId] = {};
            }
            sendPCs[purpose][senderSocketId][receiverSocketId] = pc;

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
    socket.on("receiver_candidate", (data) => { //미완성
        try {
            if(!data.candidate) return;

            //이밑으로 senderPCs새로 정의하고 마저해야함!
            let pc = senderPCs[data.purpose][data.senderSocketId];
            pc.addIceCandidate(new wrtc.RTCIceCandidate(data.candidate));
        } catch (error) {
            console.error(error);
        }
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

    //클라이언트의 영상 수신용 pc 생성
    function createReceiverPeerConnection(socket, roomId, userName, purpose) {
        let pc = new wrtc.RTCPeerConnection(pc_config);
        
        pc.onicecandidate = (e) => {
            if(!e.candidate) return;
            socket.emit("get_sender_candidate", { //아직 처리 안함
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
                console.log("once check");
                if(purpose=='user'){
                    meetingOntrackHandler(e.streams[0], socket, roomId, userName);
                }
                else if(purpose=='share'){
                    console.log("shareOntrackHandler 마저 작성하자")
                    //shareOntrackHandler();  //streams[roomId][socket.id]=e.streams[0] 해줄것
                }
            }
            once_ontrack+=1;
        }
        return pc;
    }

    //
    function createSenderPeerConnection(receiverSocketId, senderSocketId, purpose, roomId) {
        let pc = new wrtc.RTCPeerConnection(pc_config);
        let stream;
        if (purpose == 'user'){
            stream = streams[roomId][senderSocketId]
        }
        else if(purpose == 'share'){
            stream = shareStreams[roomId][senderSocketId]
        }
        else{
            console.log("pupose가 잘못됨")
            return pc;
        }
        pc.onicecandidate = (e) => {
            if(e.candidate) {
                io.to(receiverSocketId).emit("get_receiver_candidate", { //클라측 안함
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
        console.log('meeting handler')
        /*
        if(ontrackSwitch) {
            ontrackSwitch = false;
            return;
        }
        */
       
        if(!streams[roomId]) streams[roomId]={}
        streams[roomId][socket.id]=stream  //유저의 stream 변수에 저장
    
        socket.broadcast.to(roomId).emit("user_enter", { //아직안함
            socketId: socket.id,
            roomId: roomId,
            userName: userName,
            purpose: 'user',
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
    
})