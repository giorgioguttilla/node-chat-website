//https://classes.engineering.wustl.edu/cse330/index.php?title=Socket.IO
// Require the packages we will use:
var http = require("http"),
    socketio = require("socket.io"),
    fs = require("fs");
crypto = require('crypto');


// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html:
var app = http.createServer(function (req, resp) {
    // This callback runs when a new connection is made to our HTTP server.



    fs.readFile("client.html", function (err, data) {
        // This callback runs when the client.html file has been read from the filesystem.

        if (err) return resp.writeHead(500);
        resp.writeHead(200);
        resp.end(data);
    });

});
app.listen(3456);





//chatroom prototype
function ChatRoom(name, hostname, private, password, users, bannedUsers) {

    this.name = name;
    this.hostname = hostname;
    this.private = private;
    if (private) {
        this.password = password;
    } else {
        this.password = "";
    }
    //this is a list
    this.users = users;
    this.bannedUsers = bannedUsers;

};

function hash(input) {
    //creates hashed password
    var cipher = crypto.createCipher('aes-256-cbc', input);
    var hashed = cipher.update('text', 'utf8', 'hex');
    hashed += cipher.final('hex');
    return hashed;
}

//keeps a tally of all open rooms
const roomList = {};
//keeps a tally of all usernames so there are no overlaps, when accessing if it returns 1 the user exists
const userList = {};
//var username = "";
//var currentRoomName = "";


// Do the Socket.IO magic:
var io = socketio.listen(app);
io.sockets.on("connection", function (socket) {
    // This callback runs when a new Socket.IO connection is established.

    console.log("connected");
    var username = "";
    var currentRoomName = socket.id;
    //currentRoomName = socket.id;

    //when server recieves username
    socket.on('username', function(data){
        //sets username variable if not already taken, if it is add numbers to it
        username = data["username"];

        

        if(username === ''){
            username += 'user';
            username += Math.floor(Math.random() * 10);
            username += Math.floor(Math.random() * 10);
            username += Math.floor(Math.random() * 10);
            username += Math.floor(Math.random() * 10);
            username += Math.floor(Math.random() * 10);
            username += Math.floor(Math.random() * 10);
            username += Math.floor(Math.random() * 10);
            username += Math.floor(Math.random() * 10);
        }

        while(userList[username] === 'taken'){
            username += Math.floor(Math.random() * 10);
        }
        userList[username] = 'taken';
        
    });

    //honestly is probably unnecessary but whatever
    socket.on('log_out', function(){
        userList[username] = '';
    });


    //creates new chatroom object and fills it with the proper variables and
    //joins socket room.
    socket.on('create-new-room', function (data) {

        var password = hash(data.password);

        //only create a room if the name hasnt been taken

        if (!(data.roomname in roomList)) {
            //creates new chatroom object with hashed password, shouldn't matter if password is empty
            //var chatroom = new ChatRoom(data.roomname, username, data.isPrivate, data.password);
            var empty = [];
            var alsoempty = [];
            var chatroom = new ChatRoom(data.roomname, username, data.isPrivate, password, empty, alsoempty);

            //adds room to master list dict under its own name
            roomList[chatroom.name] = chatroom;

            //sends room info out to everyone
            socket.broadcast.emit('get_chatrooms', roomList);


            //joins socket room
            socket.join(chatroom.name);
            currentRoomName = chatroom.name;
            //pushes this username to the array of users in the room
            roomList[chatroom.name].users.push(username);
            //returns room info to everyone in room
            io.in(currentRoomName).emit('room_info', {
                room: roomList[data.roomname]
            });
            socket.emit('room-create-success');
        }
    });


    //query the server to return all chatrooms
    socket.on('return_chatrooms', function () {
        socket.emit('get_chatrooms', roomList);
    });

    //connects to a public room
    socket.on('public_connect', function (data) {
        console.log(roomList[data.roomname].bannedUsers);
        var banned = false;

        roomList[data.roomname].bannedUsers.forEach(function (entry) {
            if (username === entry) {
                banned = true;
            }
        });

        if (!banned) {
            socket.join(data.roomname);
            currentRoomName = data.roomname;
            roomList[data.roomname].users.push(username);
            //returns room info to everyone in room
            io.in(currentRoomName).emit('room_info', {
                room: roomList[data.roomname]
            });
            socket.emit('login_success');

        }
    });


    //check hashed password against the password of the room and emits different commands depending
    socket.on('private_connect', function (data) {

        var banned = false;
        roomList[data.roomname].bannedUsers.forEach(function (entry) {
            if (username === entry) {
                banned = true;
            }
        });

        var hashed = hash(data.password);
        if (roomList[data.roomname].password === hashed && !banned) {
            //if password is right then join room
            socket.emit('login_success');
            socket.join(data.roomname);
            currentRoomName = data.roomname;
            roomList[data.roomname].users.push(username);
            //returns room info to everyone in room
            io.in(currentRoomName).emit('room_info', {
                room: roomList[data.roomname]
            });
        } else {
            socket.emit('login_failure');
        }
    });


    //needs to remove user from users list in room and if user is host then change host
    socket.on('leave_room', function () {

        //this line removes the user from the list of users in the room 
        roomList[currentRoomName].users = roomList[currentRoomName].users.filter(u => u !== username);
        if (roomList[currentRoomName].hostname === username) {
            roomList[currentRoomName].hostname = roomList[currentRoomName].users[0];
        }
        io.in(currentRoomName).emit('room_info', {
            room: roomList[currentRoomName]
        });


        checkEmptyRoom(currentRoomName);

        socket.leave(currentRoomName);
        currentRoomName = '';

    });

    socket.on('kick_user', function (data) {
        currentHost = roomList[currentRoomName].hostname;
        if (username === currentHost) {
            roomList[currentRoomName].users = roomList[currentRoomName].users.filter(u => u !== data.user);
            if (roomList[currentRoomName].hostname === username) {
                roomList[currentRoomName].hostname = roomList[currentRoomName].users[0];
            }
            io.in(currentRoomName).emit('room_info', {
                room: roomList[currentRoomName]
            });
            io.in(currentRoomName).emit('secure_kick', {
                name: data.user
            });
            checkEmptyRoom(currentRoomName);
        }
        //currentRoomName = '';

    });

    socket.on('ban_user', function (data) {
        currentHost = roomList[currentRoomName].hostname;
        if (username === currentHost) {
            roomList[currentRoomName].users = roomList[currentRoomName].users.filter(u => u !== data.user);
            if (roomList[currentRoomName].hostname === username) {
                roomList[currentRoomName].hostname = roomList[currentRoomName].users[0];
            }
            roomList[currentRoomName].bannedUsers.push(data.user);
            io.in(currentRoomName).emit('room_info', {
                room: roomList[currentRoomName]
            });
            io.in(currentRoomName).emit('secure_kick', {
                name: data.user
            });
            checkEmptyRoom(currentRoomName);

            //currentRoomName = '';
        }
    });

    function checkEmptyRoom(roomname) {
        //if room is empty, delete it
        if (roomList[roomname].users.length == 0) {
            delete roomList[roomname];

            //tells everyone the updated list
            socket.broadcast.emit('get_chatrooms', roomList);
        }
    }

    socket.on('reset_room_props', function () {
        socket.leave(currentRoomName);
        currentRoomName = '';

    });

    //handles timeouts
    function timeoutHandler(){
        //console.log(roomList[currentRoomName].users);
        if(!socket.connected){
            //this line removes the user from the list of users in the room 
            if((currentRoomName in roomList)){
                roomList[currentRoomName].users = roomList[currentRoomName].users.filter(u => u !== username);
                if(roomList[currentRoomName].hostname === username){
                    roomList[currentRoomName].hostname = roomList[currentRoomName].users[0];
                }
                io.in(currentRoomName).emit('room_info', {room:roomList[currentRoomName]});
                
                
                checkEmptyRoom(currentRoomName);

                //socket.leave(currentRoomName);
                
            }
            currentRoomName = '';
                //removes from user list
            userList[username] = '';
        }

        setTimeout(timeoutHandler, 1000);
    }

    timeoutHandler();

    /*
    socket.on('disconnect', function(){

        //this line removes the user from the list of users in the room 
        if(currentRoomName !== ''){
            roomList[currentRoomName].users = roomList[currentRoomName].users.filter(u => u !== username);
            if(roomList[currentRoomName].hostname === username){
                roomList[currentRoomName].hostname = roomList[currentRoomName].users[0];
            }
            io.in(currentRoomName).emit('room_info', {room:roomList[currentRoomName]});
            
            
            checkEmptyRoom(currentRoomName);

            //socket.leave(currentRoomName);
            currentRoomName = '';
        }
    });
    */

    // socket.on('disconnect', function(){

    //     //this line removes the user from the list of users in the room 
    //     if(currentRoomName){
    //         roomList[currentRoomName].users = roomList[currentRoomName].users.filter(u => u !== username);
    //         if(roomList[currentRoomName].hostname === username){
    //             roomList[currentRoomName].hostname = roomList[currentRoomName].users[0];
    //         }
    //         io.in(currentRoomName).emit('room_info', {room:roomList[currentRoomName]});


    //         checkEmptyRoom(currentRoomName);

    //         socket.leave(currentRoomName);
    //         currentRoomName = '';
    //     }
    // });


    socket.on('message_to_server', function (data) {
        // This callback runs when the server receives a new message from the client.

        //if the message starts with a command, parse properly
        var words = data.message.split(' ');

        //private message in the form /private 'user' 'message'
        if (words[0] === '/private') {
            var toUser = words[1];
            words.splice(0, 2);
            var messageStr = words.join(' ');
            io.in(currentRoomName).emit("private_message", {
                user: toUser,
                message: username + ": " + messageStr
            }) // broadcast the private message to other users
        } else if (words[0] === '/poke') {
            var toUser = words[1];
            io.in(currentRoomName).emit("poke", {
                user: toUser
            })
        } else {
            console.log("message: " + data["message"]); // log it to the Node.JS output
            io.in(currentRoomName).emit("message_to_client", {
                message: username + ": " + data["message"]
            }) // broadcast the message to other users
        }
    });
});