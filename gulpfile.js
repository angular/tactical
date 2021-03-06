/// <reference path="./typings/node/node.d.ts" />
var cp = require('child_process');
var format = require('gulp-clang-format');
var gulp = require('gulp');
var gulpClean = require('gulp-clean');
var gulpMocha = require('gulp-mocha');
var gulpTsc = require('gulp-typescript');
var karma = require('karma');
var merge = require('merge2');
var runSequence = require('run-sequence');
var gulpUtil = require('gulp-util');
var through = require('through2');

function stripDtsImports() {
  return through.obj(function(file, enc, cb) {
    try {
      var contents = file.contents.toString().split('\n');
      for (var i = contents.length - 1; i >= 0; i--) {
        if (contents[i].substring(0, 14) == '/// <reference') {
          contents.splice(i, 1);
        }
      }
      file.contents = new Buffer(contents.join('\n'));
      this.push(file);
    } catch (err) {
      this.emit('error', new gulpUtil.PluginError('strip-dts-imports', err, {fileName: file.path}));
    }
    cb();
  });
}

// ==========
// config

// Sets typescript compilation options using tsconfig.json.
var tsProject = gulpTsc.createProject('./tsconfig.json', {
    typescript: require('typescript')
  });
  
var strictProject = gulpTsc.createProject('./tsconfig.json', {
    typescript: require('typescript'),
    noEmitOnError: true
  });

// Sets other typescript compilation options for Karma testing using tsconfig.json.
var karmaProject = gulpTsc.createProject('./tsconfig.json', {
  typescript: require('typescript'),
  module: 'amd'
});
  

// ==========
// helper functions

/**
 * Execute a command with arguments, piping the resulting output on stdout.
 */
function exec(cmd, args, callback) {
  var proc = cp.spawn(cmd, args);
  proc.stdout.on('data', function(buf) {
    process.stdout.write(buf);
  });
  proc.stderr.on('data', function(buf) {
    process.stderr.write(buf);
  });
  proc.on('close', function() {
    callback();
  });
}

/**
 * Catches any error generated by any task in a sequence and calls done after
 * all tasks complete successfully.
 */
function sequenceComplete(done) {
  return function (err) {
    if (err) {
      var error = new Error('build sequence failed');
      error.showStack = false;
      done(error);
    } else {
      done();
    }
  };
}


// ==========
// setup

/**
 * Runs all tasks needed to start development.
 */
gulp.task('refresh', function(done) {
  runSequence('!update.modules', '!install.typings', sequenceComplete(done));
});

/**
 * Installs node modules specified in package.json via the 'npm' command.
 */
gulp.task('!update.modules', function(done) {
  exec('npm', ['update'], done);
});

/**
 * Install typings via the 'tsd' command.
 */
gulp.task('!install.typings', function(done) {
  exec('./node_modules/tsd/build/cli.js', ['reinstall'], done);
});


// ==========
// format

/**
 * Checks that all files in modules match the format specified in .clang-format.
 */
gulp.task('check-format', function() {
  return gulp.src('./modules/**/*.ts')
    .pipe(format.checkFormat('file'))
    .on('warning', function(e) { process.stdout.write(e.message); process.exit(1) });
});


// ==========
// compile

gulp.task('!clean', function() {
  return gulp.src('./dist', {read: false}).pipe(gulpClean());
});

/**
 * Transcompile all TypeScript code to JavaScript.
 */
gulp.task('build', ['!clean'], function() {
  var tsResult = gulp.src('./modules/**/*.ts').pipe(gulpTsc(tsProject));
  return merge(
    tsResult.dts
        .pipe(stripDtsImports())
        .pipe(gulp.dest(tsProject.options.outDir)),
    tsResult.js.pipe(gulp.dest(tsProject.options.outDir))
  );
});

/**
 * Transcompile all TypeScript code to JavaScript, only if the typescript compiler emits no errors.
 */
gulp.task('build.strict', ['!clean'], function() {
  var tsResult = gulp.src('./modules/**/*.ts').pipe(gulpTsc(strictProject));
  return merge(
    tsResult.dts
        .pipe(stripDtsImports())
        .pipe(gulp.dest(tsProject.options.outDir)),
    tsResult.js.pipe(gulp.dest(tsProject.options.outDir))
  );
});

/**
 * Transcompile all TypeScript code to JavaScript for Karma testing.
 */
gulp.task('build.karma', ['!clean'], function() {
  var tsResult = gulp.src('./modules/**/*.ts').pipe(gulpTsc(karmaProject));
  return tsResult.js.pipe(gulp.dest(tsProject.options.outDir));
});


// =========
// test

/**
 * Run tests with Mocha and report the results.
 */
gulp.task('test', ['build'], function() {
  return gulp.src(['./dist/**/test/*.js', '!./dist/tactical/browser_test/*.js'])
      .pipe(gulpMocha());
});

/**
 * Run tests with Mocha and report the results in a more fun way.
 */
gulp.task('test.nyan', ['build'], function() {
  return gulp.src(['./dist/**/test/*.js', '!./dist/tactical/browser_test/*.js'])
      .pipe(gulpMocha({'reporter': 'nyan'}));
});

/**
 * Run tests with Mocha and report the results in a more fun way.
 */
gulp.task('test.strict', ['build.strict'], function() {
  return gulp.src(['./dist/**/test/*.js', '!./dist/tactical/browser_test/*.js'])
      .pipe(gulpMocha());
});

/*
 * Run tests with Mocha and Karma, as a test-runner
 */
gulp.task('test.karma', ['build.karma'], function(done) {
  karma.server.start({configFile: __dirname + '/karma.conf.js'}, done);
});

/**
 * Runs pre-submission checks to ensure the quality of future pull requests.
 */
gulp.task('pre-submit', function(done) {
  return runSequence('check-format', 'test.strict', 'test.karma', sequenceComplete(done));
});
