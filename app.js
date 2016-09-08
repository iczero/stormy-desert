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
const operpass = process.env.OPERPASS || 'passwd';

var app = express();
app.use(express.static(path.join(__dirname, '/static')));
var server = http.Server(app);
var io = sio(server);
var clients = {};
var nicks = {};
var availablecnum = [];
var clientnum = 0;

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
	if (req.headers['x-forwarded-proto']!='https' && (process.env.PRODUCTION == "true")) {
		res.redirect('https://'+req.headers.host+req.url);
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
	var cnum = availablecnum.pop();
	if (cnum == undefined) {
		cnum = clientnum;
		clientnum++;
	}
	log.info('Connection from '+socket.handshake.address+' with id '+cnum);
	socket.clientid = cnum;
	clients[cnum] = {
		socket: socket,
		nick: "client"+socket.clientid,
		admin: false
	};
	nicks[clients[socket.clientid].nick] = socket;
	sendToAll('* '+clients[socket.clientid].nick+' has joined the room');
	socket.on('disconnect', function() {
		log.info('Closed connection from '+this.handshake.address+' with id '+this.clientid);
		sendToAll('* '+clients[this.clientid].nick+' has left the room');
		delete nicks[clients[this.clientid].nick];
		delete clients[this.clientid];
		availablecnum.push(this.clientid);
	}).on('chat', function(msg) {
		log.debug('Message from client '+this.clientid+': '+msg);
		if (msg.startsWith('/')) {
			// it is a command that has not been handled by the client
			msg = msg.split(' ');
			switch(msg[0].toLowerCase()) {
				case "/nick":
					if (nicks[msg[1]]) {
						sendTo(this, '* '+msg[1]+': Nick is already in use');
					} else if (msg[1] == undefined) {
						sendTo(this, '* Please supply a nick');
					} else if (msg[1].length >= 25) {
						sendTo(this, '* '+msg[1]+': Nick is too long');
					} else {
						sendToAll('* '+clients[this.clientid].nick+' has changed their nick to '+msg[1]);
						delete(nicks[clients[this.clientid].nick]);
						nicks[msg[1]] = this;
						clients[this.clientid].nick = msg[1];
					}
					break;
				case "/me":
					msg.splice(0,1);
					sendToAll('- '+clients[this.clientid].nick+' '+msg.join(' '));
					break;
				case "/oper":
					if(msg[1]==operpass){
						sendTo(this, "* We would like to take this moment to remind you that we accept absolutely no liability for the insanity you're about to endure.");
						log.notice(clients[this.clientid].nick+' has opered from '+this.handshake.address+' with id '+this.clientid);
						clients[this.clientid].admin = true;
					} else {
						sendTo(this, '* Oper failed. This incident was logged.');
						log.notice('Failed oper from '+this.handshake.address+' with id '+this.clientid);
					}
					break;
				case "/kill":
					if(clients[this.clientid].admin){
						sendTo(nicks[msg[1]], '* You have been killed by an admin');
						nicks[msg[1]].disconnect();
						log.notice(clients[this.clientid].nick+' has killed '+msg[1]);
					} else {
						sendTo(this, "* I'm sorry, Dave. I'm afraid I can't do that.");
					}
					break;
				case "/eval":
					if(clients[this.clientid].admin){
						msg.splice(0,1);
						try{
							sendTo(this, '* Result: '+eval(msg.join(' ')).toString());
						} catch (e) {
							sendTo(this, '* Error: '+e.toString());
						}
					} else {
						sendTo(this, "* I'm sorry, Dave. I'm afraid I can't do that.");
					}
					break;
				case "/list":
					sendTo(this, '* List of currently connected clients: '+Object.keys(nicks).join(' '));
					break;
				case "/help":
					if (msg[1] == undefined) {
						msg[1] = ' ';
					}
					switch(msg[1].toLowerCase()) {
						case 'nick':
							sendTo(this, '* nick <newnick>: Changes your nickname');
							break;
						case 'me':
							sendTo(this, '* me <action>: Sends an action in 3rd person');
							break;
						case 'list':
							sendTo(this, '* list: Lists all online users');
							break;
						/* Don't list this, it is a bad idea
						case 'oper':
							sendTo(this, '* oper: Gives you crap ammounts of power')
							break; */
						case 'kill':
							if (clients[this.clientid].admin) {
								sendTo(this, '* kill: Forcibly disconnects a client');
								break;
							}
						case 'eval':
							if (clients[this.clientid].admin) {
								sendTo(this, '* eval: Runs javascript code on the server');
								break;
							}
						case ' ':
							if (clients[this.clientid].admin) {
								sendTo(this, '* Help topics available to opers: kill eval');
							}
							sendTo(this, '* Available help topics: nick me list');
							break;
						default:
							sendTo(this, '* '+msg[1]+': No such help topic');
					}
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
