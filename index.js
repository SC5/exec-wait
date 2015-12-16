Promise = require('bluebird'),
url = require('url'),
http = require('http'),
https = require('https'),
spawn = require('child_process').spawn,

/**
 * Exec utility for external processes.
 *
 * See the usage from README.md
 */
exports = module.exports = function(options) {
  var monitor = options.monitor,
      name = options.name || 'Process',
      cmd = options.cmd,
      log = options.log || console.log,
      args = options.args || [],
      retries = options.retries || 5,
      retryInterval = options.retryInterval || 1000,
      stopSignal = options.stopSignal || 'SIGTERM',
      restart = options.restart || false,
      strictSSL = (options.strictSSL == false) ? false : true, 
      child,
      isRunning = false;

  function handleExit() {
    // In case of error, we've really got an error
    log(name, 'exited with error code', code);
    isRunning = false;
  }

  function start() {
    return new Promise(function(resolve, reject) {
      // If we're already running, no need to start again
      if (isRunning && !restart) {
        log(name, 'already started');
        return Promise.resolve();
      }

      log(name, 'starting');
      isRunning = false;

      // Launch the child process
      child = spawn(cmd, args, { detached: false });

      // If we've got a monitor of some short, we should not exit prior we've
      // received something to the monitor
      function handlePrematureExit(code, signal) {
        if (options.monitor) {
          return reject(new Error(name + ' exited prematurely.'));
        }

        // In case of error, we've really got an error
        if (code > 0) {
          return reject(new Error(name + ' exited with error code ' + code));
        }
      }
      child.once('exit', handlePrematureExit);

      // Create a HTTP connection handling function that can be retried
      function connect(u, retries, retryInterval) {
        var parsed = url.parse(u),
          protocol = (parsed.protocol === 'https:') ? https : http,
          options = {
            port: parsed.port,
            hostname: parsed.hostname || 'localhost',
            path: parsed.path || '/'
          },
          connection,
          checkResponse = (typeof monitor.checkHTTPResponse === 'boolean') ?
            monitor.checkHTTPResponse: true;
        
        if (parsed.protocol === 'https:') {
          options.rejectUnauthorized = strictSSL;
          options.agent = new https.Agent(options);
        }

        connection = protocol.get(options, function(response) {
          var code = response.statusCode;

          // In case we're not monitoring errors, only accept the 200 series responses
          if (checkResponse && (code < 200 || code >= 300)) {
            reject(name + ' URL monitor failed with status code ' + code);
          }

          // OK otherwise
          log(name, 'got URL response - running');
          resolve();
        })

        // Monitor for connection errors to trigger retries.
        connection.on('error', function(e) {
          log(name, 'error in connecting to', u);
          log(e.toString());
          // Retry after a timeout
          if (retries > 0) {
            setTimeout(function() {
              connect(u, retries-1, retryInterval);
            }, retryInterval);
          }
        })
      }

      // If we're monitoring stdout, create a stdout listener
      if (monitor && monitor.stdout) {
        child.stdout.on('data', function(data) {
          var str = String(data);
          //log(str);

          // Wait for a string to resolve we're done
          if (str.match(monitor.stdout)) {
            // Resolve the startup process
            log(name, 'got stdout response - running');
            resolve();
          }
        });
      }

      // If we're monitoring port, create a connection
      if (monitor && monitor.url) {
        connect(monitor.url, retries, retryInterval);
      }
    })
    .then(function() {
      // Update the state
      isRunning = true;
      return Promise.resolve(true);
    });
  }

  function stop() {
    return new Promise(function(resolve, reject) {
      log(name, 'stopping');
      // Don't exit if we already have
      if (!running()) {
        return resolve();
      }

      child.on('exit', function(code, signal) {
        resolve();
      });

      child.kill(stopSignal);
    })
    .then(function() {
      log(name, 'stopped');
      isRunning = false;
    })
  }

  function running() {
    return isRunning;
  }

  return {
    start: start,
    stop: stop,
    running: running
  };
}
