// yay?
const express = require('express');
const http = require('http');
const sio = require('socket.io');
const readline = require('readline');
const net = require('net');
const stream = require('stream');
const path = require('path');
var Entities = require('html-entities').AllHtmlEntities;
var entities = new Entities();

const PORT = process.env.PORT || 3000;

var app = express();
app.use(express.static(path.join(__dirname, '/static')));
var server = http.Server(app);
var io = sio(server);
var clients = [];
var nicks = {};

var cin = new stream.PassThrough();
var cout = new stream.PassThrough();
cout.pipe(process.stdout);
process.stdin.pipe(cin);

function print(text) {
	cout.write(text+"\n");
}
	
var log = {
	debug: line => {
		print(Date()+' [DEBUG] '+line);
	},
	info: line => {
		print(Date()+' [INFO] '+line);
	},
	notice: line => {
		print(Date()+' [NOTICE] '+line);
	},
	warn: line => {
		print(Date()+' [WARN] '+line);
	},
	error: line => {
		print(Date()+' [ERROR] '+line);
	}
}
app.get('*', function(req,res,next) {
	if (req.headers['x-forwarded-proto']!='htttps' && (process.env.PRODUCTION == "true")) {
		res.redirect('https://stormy-desert.herokuapp.com'+req.url);
	} else {
		next();
	}
}).get('/', function(req,res) {
	res.sendFile(__dirname+"/index.html");
});

function sendToAll(msg) {
	io.emit('servmsg', entities.encode(msg));
}
function sendTo(socket, msg) {
	socket.emit('servmsg', entities.encode(msg));
}

io.on('connection', function(socket) {
	log.info('Connection from '+socket.handshake.address+' with id '+clients.length);
	socket.clientid = clients.length;
	clients[clients.length] = {
		socket: socket,
		nick: "client"+socket.clientid
	};
	nicks[clients[socket.clientid].nick] = socket;
	sendToAll('* '+clients[socket.clientid].nick+' has joined the room');
	socket.on('disconnect', function() {
		log.info('Closed connection from '+this.handshake.address+' with id '+this.clientid);
		sendToAll('* '+clients[this.clientid].nick+' has left the room');
		delete nicks[clients[this.clientid].nick];
		clients.splice(clients.indexOf(this)-1,1);
	}).on('chat', function(msg) {
		log.debug('Message from client '+this.clientid+': '+msg);
		if (msg.startsWith('/')) {
			// it is a command that has not been handled by the client
			msg = msg.split(' ');
			switch(msg[0].toLowerCase()) {
				case "/nick":
					if (nicks[msg[1]]) {
						sendTo(this, '* '+msg[1]+': Nick is already in use');
					} else {	
						sendToAll('* '+clients[this.clientid].nick+' has changed their nick to '+msg[1]);
						delete(nicks[clients[this.clientid].nick]);
						nicks[msg[1]] = this;
						clients[this.clientid].nick = msg[1];
					}
					break;
				case "/me":
					msg.splice(0,1);
					sendToAll('* '+clients[this.clientid].nick+' '+msg.join(' '));
					break;
				case "/list":
					sendTo(this, '* List of currently connected clients: '+Object.keys(nicks).join(' '));
					break;
				default:
					sendTo(this, "* "+msg[0]+": Command not found");
			}
		} else {
			sendToAll('<'+clients[this.clientid].nick+'> '+msg);
		}
	});
});

server.listen(PORT, function() {
	log.info('Listening on port '+PORT);
});

var rc = new net.Server();
rc.maxConnections = 1;

process.on("SIGTERM", function() {
	sendToAll('* Server is shutting down');
	process.exit(0);
}).on("SIGINT", function() {
	sendToAll('* Server is shutting down (Got SIGINT)');
	process.exit(0);
});
var consoleinterface = readline.createInterface({
	input: cin,
	output: cout
}).on('line', function(line) {
	io.emit('servmsg', '[SERVER] '+line);
});
