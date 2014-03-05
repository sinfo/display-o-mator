var Hapi = require('hapi');
var https = require('https');
var http = require('http');
var Twitter = require('./node_modules/node-twitter');
var io = require("socket.io");
var config = require("./config");

var socket,
    connections;

var twitterSearchClient = new Twitter.SearchClient(
    config.twitter.consumer_key,
    config.twitter.consumer_secret,
    config.twitter.token,
    config.twitter.token_secret
);

var lanyrdURL = "http://lanyrd.com/2014/sinfo/schedule/608632f7dd7ebf19.v1.json",
    //instagramURL = "https://api.instagram.com/v1/tags/sinfo_ist/media/recent?client_id=" + config.instagram.client_id;
    instagramURL = "https://api.instagram.com/v1/users/1116368572/media/recent?client_id=" + config.instagram.client_id,
    twitterQuery = "sinfo_ist",
    liveStreamKey = "";


var server,
    port = 2121;

var lanyrdData = [],
	instagramData = [],
    twitterData = [];

var options = {
    views: {
        path: 'templates',
        engines: {
            html: 'handlebars'
        },
        partialsPath: 'partials'
    }
}; 

var routes = [
    { method: 'GET', path: '/', config: { handler: homeHandler } },
    { method: 'GET', path: '/{path*}', handler: {
        directory: { path: './public', listing: true, index: true }
    } }
];

function init() {
    // Create a server with a host, port, and options
    server = Hapi.createServer('0.0.0.0', port, options);

    server.route(routes);
    
    // Set up Socket.IO to listen on port 8000
    socket = io.listen(2180);

    // Configure Socket.IO
    socket.configure(function() {
        // Only use WebSockets
        socket.set("transports", ["websocket"]);

        // Restrict log output
        socket.set("log level", 2);
    });

    // Start the server
    server.start(function () {
        uri = server.info.uri;
        console.log('Server started at: ' + server.info.uri);
    });

    connections = [];

    update();
    setInterval(update, 30000);

    // Start listening for socket connections
    socket.sockets.on("connection", onSocketConnection);
};

// HAPI HANDLER
function homeHandler (request, reply) {
    // Render the view with the custom greeting
    reply.view('index.html', { 
        instagramData: instagramData,
        lanyrdData: lanyrdData,
        twitterData: twitterData
    });
};

// New socket connection
function onSocketConnection(socket) {
    console.log("New connection!");
    socket.emit('new stuff', { instagramData: instagramData, lanyrdData: lanyrdData, twitterData: twitterData });
    if(liveStreamKey && liveStreamKey != ""){
        socket.emit('new stream', { key: liveStreamKey });
    }

    connections.push(socket);

    socket.on("new stream", function(data) {
        if(data && data.key && data.key != "") {
            liveStreamKey = data.key;
        } else {
            liveStreamKey = "";
        }
        this.broadcast.emit("new stream", { key: liveStreamKey });
        this.emit("new stream", { key: liveStreamKey });

        console.log("new stream", liveStreamKey);
    });

    socket.on("stop stream", function(data) {
        liveStreamKey = "";
        
        this.broadcast.emit("stop stream");
        this.emit("stop stream");

        console.log("stop stream");
    });
};


function update () {
    getLanyrdData();
    getInstagramData();
    getTwitterData();

    // Broadcast updated position to connected socket clients
    if(connections[0]){
        connections[0].emit('new stuff', { instagramData: instagramData, lanyrdData: lanyrdData, twitterData: twitterData });
        connections[0].broadcast.emit('new stuff', { instagramData: instagramData, lanyrdData: lanyrdData, twitterData: twitterData });
    }

    console.log("update!");
};

function getLanyrdData () {
    http.get(lanyrdURL, function(res) {
        var body = '';

        res.on('data', function(chunk) {
            body += chunk;
        });

        res.on('end', function() {
            var response = JSON.parse(body);
            lanyrdData = filterSessions(response.sessions).slice(0,8);
        });
    }).on('error', function(e) {
          console.log("Got error: ", e);
    });
}

function getInstagramData () {
    https.get(instagramURL, function(res) {
        var body = '';

        res.on('data', function(chunk) {
            body += chunk;
        });

        res.on('end', function() {
            var response = JSON.parse(body);
            instagramData = response.data;//.slice(0,4);
        });
    }).on('error', function(e) {
          console.log("Got error: ", e);
    });
}

function getTwitterData () {
    twitterSearchClient.search({'q': twitterQuery}, function(error, result) {
        if (error)
        {
            console.log('Error: ' + (error.code ? error.code + ' ' + error.message : error.message));
        }

        if (result)
        {
            twitterData = result.statuses.slice(0,6);
        }
    });
}

function filterSessions(sessions){
    var allSessions = []
    for(var i=0; i<sessions.length; i++) {
        allSessions = allSessions.concat(sessions[i].sessions);
    }

    var now = new Date();

    // Let's get today's sessions that didnt end yet 
    var filtered = allSessions.filter(function (element) {
        var end_time = new Date(element.end_time);
        var start_time = new Date(element.start_time);

        return end_time >= now && end_time.setHours(0,0,0,0) == now.setHours(0,0,0,0);
    });

    return filtered;
}

// FIRE IN THE HOLE!!!
init();