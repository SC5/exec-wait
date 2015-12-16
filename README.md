# Exec-wait

A simple promiseful execution utility that waits for input from stdout or a
HTTP/HTTPS request to return until giving the control to the next command in
the chain.

Useful e.g. for test automation process chains etc.

## Installation

    > npm install exec-wait

## Usage

    var ghostDriver = exec({
      name: 'Ghostdriver',
      cmd: path.join(require.resolve('phantomjs'), '../phantom/bin',
        'phantomjs' + (process.platform === 'win32' ? '.exe' : '')),
      args: ['--webdriver=4444', '--ignore-ssl-errors=true'],
      monitor: { stdout: 'GhostDriver - Main - running on port 4444' }
    });

    var cmdAndArgs = require('package.json).scripts.start.split(/\s/),
      testServer = exec({
        name: 'Test server',
        cmd: cmdAndArgs[0],
        args: cmdAndArgs.slice(1),
        monitor: {
          url: 'http://localhost:8080/',
          checkHTTPResponse: false
        },
        httpOptions: {
          rejectUnauthorized: false
        }
      });

    testServer.start()
      .then(ghostDriver.start)
      .then(function() {
        // Do something
      })
      .then(ghostDriver.stop)
      .then(testServer.stop);

httpOptions can be used to pass options to http / https modules. e.g. rejectUnauthorized skips certificate validity checks (required for self-signed certificates)

## License

Copyright (c) 2014 [SC5](http://sc5.io/), licensed for users and contributors under MIT license.
https://github.com/sc5/grunt-bobrsass-boilerplate/blob/master/LICENSE-MIT
