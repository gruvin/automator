/* TIMERS

  timer data lives in text files inside the timers/ folder.
  The filename is the GPIO port followed by .txt.
  
  The format of data in each timer file is (a work in progress) ...

      HH:MM state condition # comment to end of line

  ... where "HH:MM" is in 24hr format, state is either "on" or "off" and condition is yet to be defined 

*/
var debug = require("debug")("automator:timers");
var 
  fs = require('fs'),
  path = require('path'), 
  rpio = require('rpio'),
  io = require('socket.io-client');

module.exports = {

  init: function() {
  
    var socket = io.connect('http://localhost:8000');
    socket.on('connect', function() { debug("Timer control socket connected"); });
    socket.on('connect_error', function(err) { debug("Timer control socket did not connect: error=", err); });
     
    var lastSecs = -1;
    setInterval(
      function() {
        var date = new Date();
        var secs = date.getSeconds();
        if (secs == lastSecs) return;
        lastSecs = secs;
        if (secs == 0) checkTimers();
      }, 250 
    );

    function getTimes(gpio, cb) { // async
      var filename = __dirname + "/timers/" + gpio + ".txt";
      var times = new Array();

      fs.exists(filename, function(exists) {
        if (!exists) return cb(times);
        
        // read the file into an array of lines
        var fileLines = fs.readFileSync(filename).toString().split(/\r?\n/); 
        var timerGPIO = parseInt(path.basename(filename, ".txt"));

        // parse the timer file lines ... 
        fileLines.forEach( function(line) {
          if (line.length > 0) {
            var l = line.trim().split('#');
            var data = l[0].trim();
            var comment = l[1] || '';
            if (data.length > 0) {
              t = data.split(' '); // split out the data components 
              times.push({ time: t[0], state: t[1], condx: t[2], comment: comment.trim() } );
            }
          }
        });
        return cb(times);
      });
    }

    function checkTimers() { // executed at the zeroeth second of each minute
      var dateNow = new Date();
      var timerDir = __dirname + "/timers";

      var currentTime = dateNow.toString();

      // get a list of all timer (GPIO.txt) files from timers/ dir
      var timers = fs.readdirSync(timerDir);

      // loop through the list of files in /timers. Filename part is GPIO number.
      timers.forEach( function(filename) {
        
        if (path.extname(filename) == '.txt') {
          
          var timerGPIO = parseInt(path.basename(filename, ".txt"));
          
          getTimes(timerGPIO, function(timesArray) {

            // process the times array... 
            var timeIndex = -1;
            var BreakException = {}; // gives us a way to break out of the forEach loop
            try {
              timesArray.forEach( function(timeObj) {

                // if this time has not passed then increment timeIndex and keep looping, else break
                var minutesSinceMidnightNow = dateNow.getMinutes() + dateNow.getHours() * 60;
                var t = timeObj.time.split(':');
                var minutesSinceMidnightCheck = parseInt(t[1]) + parseInt(t[0]) * 60;
                if (minutesSinceMidnightNow < minutesSinceMidnightCheck) throw BreakException;
                timeIndex++;

              });
            } catch(e) {
              if (e !== BreakException) throw e;
            }

            if (timeIndex >= 0) {
              var currentState = rpio.read(timerGPIO);
              var time = timesArray[timeIndex].time;
              var state = timesArray[timeIndex].state;
              var comment = timesArray[timeIndex].comment;
              var newState = (state == "on") ? 1 : 0;
              if (newState != currentState) {
                debug("GPIO TIMER: [%d] %s -> %s", timerGPIO, time, state.toUpperCase() );
                socket.emit('setport', {
                  port: timerGPIO, 
                  state: newState, 
                  comment: comment,
                  who: "Server",
                  why: "Timer"
                } ); // broadcast
              }
            }

          });
        }

      });
    }
  },

  getTimes: function(gpio, cb) {
    var timerFile = __dirname + '/timers/' + gpio + '.txt';
    fs.exists(timerFile, function(exists) {
      if (!exists) return cb({ error: 'No data for GPIO timer ' + gpio + ' exists' });
      var fileLines = fs.readFileSync(timerFile).toString().split(/\r?\n/); 
      var data = [ ];
      fileLines.forEach(function(line) {
        var l = line.split('#'); // split comments off
        var t = l[0].trim();
        if (t !== '') { // if anything remains for thiis line ...
          var d = t.split(/\s/); // split by whitespace
          debug(d);
          data.push( { "time": d[0], "state": d[1], "condx": d[2] || ''  } );
        }
      });
      return cb({ "status": "ok",  "results": data });
    });
  }
}

