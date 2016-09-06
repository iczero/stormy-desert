/* TLS is cool */
const express = require('express');
const http = require('http');
const sio = require('socket.io');
const readline = require('readline');

const PORT = process.env.PORT || 3000;

var app = express();
var server = http.Server(app);
var io = sio(server);
var clients = [];

app.get('/', function(req,res) {
	res.sendFile(__dirname+"/index.html");
}).get('/static/jquery-1.11.1.js', function(req,res) {
	res.sendFile(__dirname+"/static/jquery-1.11.1.js");
});

io.on('connection', function(socket) {
	console.log('[INFO] Connection from '+socket.handshake.address+' with id '+clients.length);
	clients[clients.length] = socket;
	socket.on('disconnect', function() {
		console.log('[INFO] Closed connection from '+this.handshake.address+' with id '+clients.indexOf(this));
		clients.splice(clients.indexOf(this)-1,1);
	}).on('chat', function(msg) {
		console.log('[DEBUG] Message from client '+clients.indexOf(this)+': '+msg);
		io.emit('servmsg', msg);
	});
});

server.listen(PORT, function() {
	console.log('Listening on port '+PORT);
});

readline.createInterface({
	input: process.stdin,
	output: process.stdout
}).on('line', function(line) {
	io.emit('servmsg', line);
});

