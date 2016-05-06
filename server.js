// Copyright IBM Corp. 2015. All Rights Reserved.
// Node module: pm-load-test
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

var _ = require('lodash');
var concat = require('concat-stream');
var express = require('express');
var fmt = require('util').format;
var http = require('http');
var os = require('os');
var uuid = require('node-uuid');

var app = express();
var handlers = express.Router();
var server = app.listen(process.env.PORT || 0, '0.0.0.0', function() {
  var host = server.address().address;
  var port = server.address().port;
  app.set('port', port);
  log({src: 'startup'}, null, 'Server listening on http://%s:%d/', host, port);
});

app.use(instrument, handlers);
handlers.param('hops', function(req, res, next, hops) {
  req.hops = 0|(hops || 0);
  next();
});

handlers.get('/', function(req, res, next) {
  res.json({t: new Date()});
  soon(next);
});

handlers.get('/chain/:hops', function(req, res, next) {
  next = delayed(next);
  if (req.hops > 0) {
    var upstream = {
      host: '127.0.0.1',
      port: app.get('port'),
      path: fmt('/chain/%d', req.hops - 1),
      headers: {
        'X-ID': req.xid,
      },
    };
    http.get(upstream, function(ures) {
      res.statusCode = ures.statusCode;
      ures.pipe(concat(function(body) {
        try {
          body = JSON.parse(body);
        } catch (err) {
          body = [{err: err}];
        }
        body.push({hop: req.hops});
        return res.json(body);
      }));
      ures.on('close', next);
      ures.on('error', next);
    }).on('error', next);
  } else {
    res.json([{hop: req.hops}]);
    return next();
  }
});

handlers.post('/die', function(req, res, next) {
  soon(next);
  eventually(process.exit, 13)
});

setInterval(tick, 1500);

function tick() {
  log({src: 'clock'}, null, 'load: %j', os.loadavg());
  log({src: 'clock'}, null, 'free memory: %jk', os.freemem() >> 10);
  maybe(eventually, process.exit, 42);
}

// call fn(args..) after some random "long" delay
function eventually(fn /*, args...*/) {
  fn = _.partial.apply(_, arguments);
  return _.delay(fn, _.random(0, 2000));
}

// call fn(args...) after some random "short" delay
function soon(fn /*, args...*/) {
  fn = _.partial.apply(_, arguments);
  return _.delay(fn, _.random(0, 200));
}

// return a variant of fn that fn that has its execution delayed randomly
function delayed(fn) {
  return _.partial(eventually, fn);
}

// maybe call fn(args...)
function maybe(fn, args) {
  args = _.toArray(arguments).slice(1);
  if (_.random(0, 1000) === 42) {
    fn.apply(null, args);
  }
}

function instrument(req, res, next) {
  req.start = process.hrtime();
  req.xid = req.get('X-ID') || uuid.v4();
  res.on('finish', function() {
    log(req, res);
  });
  next();
}

// This is still quieter than a lot of production apps, but we incur almost
// no load to generate this, so we can just fire more requests to increase
// the log volume.
function log(req, res /*, msg... */) {
  var msgArgs = _.toArray(arguments).slice(2);
  var entry = _.merge({
    t: new Date(),
    pid: process.pid,
    uptime: process.uptime(),
    host: os.hostname(),
  }, makeCtx(req, res));
  if (msgArgs.length > 0) {
    entry.msg = fmt.apply(null, msgArgs);
  }
  console.log(JSON.stringify(entry));
}

function makeCtx(req, res) {
  return {
    src: req ? req.src || 'http' : 'other',
    httpHost: req && req.hostname || '-',
    ip: req && req.yaip || '-',
    method: req && req.method || '-',
    url: req && req.url || '-',
    status: res && res.statusCode || '-',
    duration: req && req.start && ms(process.hrtime(req.start)) || '-',
    xid: req && req.xid || '-',
  };
}

function ms(t) {
  return 0|(t[0] * 1e3 + t[1] / 1e6);
}
