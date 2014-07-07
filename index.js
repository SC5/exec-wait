Promise = require('bluebird'),
url = require('url'),
http = require('http'),
https = require('https'),
spawn = require('child_process').spawn,

/**
 * Exec utility for external processes.
 * Sample use:
 *
 * var ghostDriver = exec({
 *   name: 'Ghostdriver',
 *   cmd: path.join(require.resolve('phantomjs'), '../phantom/bin',
 *     'phantomjs' + (process.platform === 'win32' ? '.exe' : '')),
 *   args: ['--webdriver=4444', '--ignore-ssl-errors=true'],
 *   monitor: { stdout: 'GhostDriver - Main - running on port 4444' }
 * });
 *
 * var cmdAndArgs = require('package.json).scripts.start.split(/\s/),
 *   testServer = exec({
 *     name: 'Test server',
 *     cmd: cmdAndArgs[0],
 *     args: cmdAndArgs.slice(1),
 *     monitor: { url: 'http://localhost:8080/' },
 *     log: console.warn
 *   });
 *
 * testServer.start()
 *   .then(ghostDriver.start)
 *   .then(function() {
 *     // Do something
 *   })
 *   .then(ghostDriver.stop)
 *   .then(testServer.stop);
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
          protocol = (parsed.protocol === 'https') ? https : http,
          options = {
            port: parsed.port,
            hostname: parsed.hostname || 'localhost',
            path: parsed.path || '/'
          },
          connection;

        connection = protocol.get(options, function(response) {
          var code = response.statusCode;

          // Only accept responses with 200 series
          if (code < 200 || code >= 300) {
            reject(name + ' URL monitor failed with status code ' + code);
          }

          // OK otherwise
          log(name, 'got URL response - running');
          resolve();
        })

        // Monitor for connection errors to trigger retries.
        connection.on('error', function() {
          log(name, 'error in connecting to', u);

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
