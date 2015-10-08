var debug = require('debug')('automator:http');
var 
  fs = require('fs'),
  path = require('path'), 
  express = require('express'),
  bodyParser = require('body-parser'),
  app = express(),
  timers = require("./timers.js");


/////////////////////////////////////////////////////////////////////////////////////////////////////////
//// GPIO SET-UP
var rpio = require('rpio');
rpio.setMode('gpio'); // user GPIO numbers, rather than R'Pi pin numbers
rpio.setOutput(22);
rpio.setOutput(27);
rpio.setOutput(17);
////
/////////////////////////////////////////////////////////////////////////////////////////////////////////


/////////////////////////////////////////////////////////////////////////////////////////////////////////
//// MAIN WEB SERVER for HTML content, etc
app.use(require("morgan")("short")); // nicer logging


app.get('/timer/:gpio', function(req, res, next) {
  timers.getTimes(req.params.gpio, function(result) {
    debug(result);
    res.send(result);
  });
});

app.use('/', express.static('public')); // static files from ./public/ directory

// ERROR handlers (404 is not an error, per se)
app.use(function(req, res) {
  var fn = __dirname + "/public/404.html";
  fs.exists(fn, function(exists) {
    if (exists)
      res.status(404).sendFile(fn); 
    else
      res.end("<h1>404 - File Not Found</h1>");
  });
});

app.use(function(err, req, res, next) {
  if (res.headersSent) { // delegate to default handler if headers already sent
    return next(err);
  }
  console.log(err.stack);
  res.status(500).send("<h1>500 - Server Error</h1><h2>D'oh!</h2>");
});

var server = require('http').createServer(app); // listen for http connections
server.listen(8000);                           
////
/////////////////////////////////////////////////////////////////////////////////////////////////////////


/////////////////////////////////////////////////////////////////////////////////////////////////////////
//// SOCKET SERVER for I/O control and status broadcasts
var io = require('socket.io')(server);

io.on('connection', function(socket) {

  var addr = socket.handshake.address;
  debug("Socket connection from %s", addr);

  socket.emit('update', [
    { "port": 22, "state": rpio.read(22) },
    { "port": 27, "state": rpio.read(27) },
    { "port": 17, "state": rpio.read(17) },
  ]);

  socket.on('setport', function (data) {
    debug('SKT EVENT: setport - ', JSON.stringify(data));
    rpio.write(data.port, data.state);

    var dataArray = [ data ];
    io.emit('update', dataArray); // broadcast
  });

});
////
/////////////////////////////////////////////////////////////////////////////////////////////////////////

timers.init();

