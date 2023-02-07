//import { io } from "https://cdn.socket.io/4.4.1/socket.io.esm.min.js";

const socket = io('http://localhost:8080', {secure: true, cors: { origin: '*' }});   //로컬용 url
//const socket = io('https://i8e207.p.ssafy.io:443', {secure: true, cors: { origin: '*' }});    //서버용 url


const pc_config = {
    iceServers: [
        {
            urls: "stun:edu.uxis.co.kr"
        },
        {
            urls: "turn:edu.uxis.co.kr?transport=tcp",
                    "username": "webrtc",
                    "credential": "webrtc100!"
        }
    ]
}


let roomId, myName;

onload();




function onload() {
    

    myName =  prompt("사용자 명");
    roomId = prompt("방 이름");

    socket.emit("room_info", {
        roomId: roomId,
        userName: myName
    });
}