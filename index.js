#!/usr/bin/env node
'use strict';
var path = require('path')
  , async = require('async')
  , cp = require('child_process')
  , fs = require('fs')
  , glob = require('glob')
  , ora = require('ora')
  , pkg = require('./package')
  , spinner = ora({
    text: 'The hamsters are working...'
    , spinner: 'star'
  })

  , shouldInstall = process.argv.indexOf('--no-install') === -1 && process.argv.indexOf('-ni') === -1
  , includeDevDependencies = process.argv.indexOf('--no-dev') === -1 && process.argv.indexOf('-nd') === -1
  , shouldRemoveShrinkwrapFile = process.argv.indexOf('--remove-shrinkwrap') !== -1 || process.argv.indexOf('-d') !== -1

  , commands = [
    'npm cache clear',
    shouldRemoveShrinkwrapFile ?
      './npm-shrinkwrap.json' :
      '',
    shouldInstall ?
      'npm install' :
      '',
    'npm prune',
    'npm dedupe',
    includeDevDependencies ?
      'npm shrinkwrap --dev' :
      'npm shrinkwrap'
  ]
  , isProblematic = function (badDeps) {
      return function (name) {
        return badDeps.indexOf(name) !== -1;
      };
  }

  , cleanDependencies = function (depObject, testFunction) {
    return Object.keys(depObject).reduce(function (result, key) {
      if (!testFunction(key)) {
        if ( depObject[key].dependencies) {
          result[key] = depObject[key];
          result[key].dependencies = cleanDependencies(depObject[key].dependencies, testFunction);
        } else {
          result[key] = depObject[key];
        }
      }

      return result;
    }, {});
  };

if (process.argv.indexOf('-v') >= 0 || process.argv.indexOf('--version') >= 0) {
  console.log(pkg.version);
  process.exit(0);
}

if (process.argv.indexOf('-h') >= 0 || process.argv.indexOf('--help') >= 0) {
  console.log(`safe-shrinkwrap version: ${pkg.version}`);
  console.log('');
  console.log(`    -d, --remove-shrinkwrap : deletes the shrinkwrap prior to install`)
  console.log(`    -nd, --no-dev : doesn't include dev dependencies in the shrinkwrap file`)
  console.log(`    -ni, --no-install : doesn't run npm install`)
  console.log(`    -v, --version : outputs just the version`)
  console.log(`    -h, --help : outputs this help information`)
  process.exit(0);
}

if (shouldInstall) {
  console.log('Clearing NPM cache and Proceeding to reinstall before we shrinkwrap');
}

spinner.start();

function wrapExec(command, callback) {
  cp.exec(command, function(err, stdout, stderr) {
    if (err) {
      callback(err);
      return;
    }

    callback(null, {command: command, stdout: stdout, stderr: stderr});
  });
}

function wrapUnlink(path, callback) {
  fs.access(path, fs.F_OK, function(err) {
    // catch error when file doesn't exist and return as success
    if (err) {
      callback();
      return;
    }

    fs.unlink(path, function(err, result) {
      if (err) {
        callback(err);
        return;
      }
      callback();
    });
  });
}

async.series(commands.map(function(cmd) {
  if (!cmd) return function(callback) { callback(null, true); };
  else if (cmd === './npm-shrinkwrap.json') return async.apply(wrapUnlink, cmd);

  return async.apply(wrapExec, cmd)
}), function(err, result) {
  if (err) {
    console.log(err);
    return;
  }

  glob('./node_modules/**/package.json', function (err, files) {
    var shrinkwrapped = require(path.join(process.cwd(), './npm-shrinkwrap.json'))
      , badDeps = files.reduce(function (accum, file) {
          try {
            var depDetails = require(path.join(process.cwd(), file));

            if (typeof depDetails.os !== 'undefined') {
              accum.push(depDetails.name);
            }
          } catch (e) {
          }

          return accum;
        }, [])
      , clean = cleanDependencies(shrinkwrapped.dependencies, isProblematic(badDeps))
      , finalObj = JSON.parse(JSON.stringify(shrinkwrapped));

    finalObj.dependencies = clean;

    fs.writeFile(path.join(process.cwd(), './npm-shrinkwrap.json'), JSON.stringify(finalObj, null, 4));
    fs.writeFile(path.join(process.cwd(), './npm-shrinkwrap.unsafe.json'), JSON.stringify(shrinkwrapped, null, 4));
    spinner.stop();

    console.log("They're done! So is your shrinkwrap file.");
  });
});
