/**
 * Pigeon
 *
 * Sending mails over HTTP.
 *
 * Copyright (c) 2014 by Hsiaoming Yang.
 */

var fs = require('fs');
var http = require('http');
var path = require('path');
var nodemailer = require("nodemailer");

var themes = ['paper'];
var themeCache = {};


/**
 * Pigeon
 *
 * Create an instance of Pigeon for sending mails.
 */
function Pigeon(config, secret, data) {
  // config contains mail services
  this.config = config || {};
  this.secret = secret;

  // default data
  this._data = data || {};
}


/**
 * Send mails with the given data.
 */
Pigeon.prototype.send = function(data, cb) {
  var me = this;

  if (!data.title) {
    cb('title is required');
  } else if (data.html || data.text) {
    me.sendMail(data, cb);
  } else if (data.content) {
    data.footer = data.footer || me._data.footer || '';
    render(data, function(err, html) {
      if (err) {
        cb(err);
      } else {
        data.html = html;
        me.sendMail(data, cb);
      }
    });
  } else {
    cb('content is required');
  }
};
Pigeon.prototype.sendMail = function(data, cb) {
  var me = this;

  var config = chooseConfig(data, me.config);
  var transport = config.transport || 'SMTP';
  var smtp = nodemailer.createTransport(transport, config);
  var options = {
    from: config.sender || config.auth.user,
    to: data.user,
    subject: data.title,
    text: data.text,
    html: data.html,
    cc: data.cc,
    bcc: data.bcc
  };

  var headers = config.headers || {};
  if (data.headers) {
    try {
      Object.keys(data.headers).forEach(function(key) {
        headers[key] = data.headers[key];
      });
    } catch (e) {
      cb('error headers');
      return;
    }
  }

  if (Object.keys(headers).length) {
    options.headers = headers;
  }

  smtp.sendMail(options, function(err, resp) {
    cb(err, resp);
    smtp.close();
  });
};


/**
 * Create a HTTP server.
 */
Pigeon.prototype.server = function() {
  var me = this;

  var server = http.createServer(function(req, resp) {
    var secret = req.headers['x-pigeon-secret'];
    var ct = req.headers['content-type'];

    // should return in 10s
    resp.setTimeout(10000);

    var body = '';
    var headers = {'Content-Type': 'text/plain'};

    if (req.url === '/') {
      body = 'humor';
      headers['Content-Length'] = body.length;
      resp.writeHead(200, headers);
      resp.end(body);
    } else if (req.method !== 'POST' || req.url !== '/send') {
      body = 'not found';
      headers['Content-Length'] = body.length;
      resp.writeHead(404, headers);
      resp.end(body);
    } else if (secret === me.secret && ct === 'application/json') {
      var buf = '';
      req.setEncoding('utf8');
      req.on('data', function(chunk) { buf += chunk });
      req.on('end', function() {
        // data should contain: user, (title, content) or html
        // data may contain: footer, theme
        var data = JSON.parse(buf);
        me.send(data, function(err) {
          if (err) {
            body = 'error';
          } else {
            body = 'ok';
          }
          headers['Content-Length'] = body.length;
          resp.writeHead(200, headers);
          resp.end(body);
        });
      });
    } else {
      body = 'invalid';
      headers['Content-Length'] = body.length;
      resp.writeHead(404, headers);
      resp.end(body);
    }
  });

  return server;
};


function getTheme(name, cb) {
  name = name || 'paper';
  if (!~themes.indexOf(name)) {
    name = 'paper';
  }
  var text = themeCache[name];
  if (text) {
    cb(null, text);
  } else {
    var filepath = path.join(__dirname, 'templates', name + '.html');
    fs.readFile(filepath, {encoding: 'utf8'}, function(err, text) {
      if (err) {
        cb(err);
      } else {
        themeCache[name] = text;
        cb(null, text);
      }
    });
  }
}

function render(data, cb) {
  getTheme(data.theme, function(err, text) {
    if (err) {
      cb(err);
    } else {
      text = text.replace(/\{\{title\}\}/g, data.title || '');
      text = text.replace(/\{\{content\}\}/g, data.content || '');
      text = text.replace(/\{\{footer\}\}/g, data.footer || '');
      cb(null, text);
    }
  });
}

function chooseConfig(data, configs) {
  if (data.service && configs[data.service]) {
    return configs[data.service];
  }

  if (~data.user.indexOf('@qq.com') && configs.qq) {
    return configs.qq;
  } else if (~data.user.indexOf('@gmail.com') && configs.gmail) {
    return configs.gmail;
  } else {
    // random choose
    var keys = Object.keys(configs);
    var index = Math.floor(Math.random() * keys.length);
    if (index >= keys.length) index = keys.length - 1;
    return configs[keys[index]];
  }
}

module.exports = Pigeon;
