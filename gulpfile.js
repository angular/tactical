var cp = require('child_process');
var gulp = require('gulp');
var gulpTsc = require('gulp-typescript');
var mocha = require('gulp-mocha');

// Get typescript configuration from tsconfig.json.
var tsProject = gulpTsc.createProject('./tsconfig.json', {
    typescript: require('typescript')
  });

/**
 * Execute a command with arguments, piping the resulting output to the console.
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
 * Install typings via the 'tsd' command.
 */
gulp.task('install.typings', function(done) {
  exec('./node_modules/tsd/build/cli.js', ['reinstall'], done);
})

/**
 * Compile all Typescript code into Javascript.
 */
gulp.task('build', ['install.typings'], function(done) {
  var tsResult = gulp.src('./modules/**/*.ts')
      .pipe(gulpTsc(tsProject));
  return tsResult.js.pipe(gulp.dest(tsProject.options.outDir));
});

/**
 * Run tests with Mocha and report the results.
 */
gulp.task('test', ['build'], function() {
  return gulp.src('./dist/**/test/*.js')
      .pipe(mocha());
});

/**
 * Run tests with Mocha and report the results in a slightly different way.
 */
gulp.task('test.nyan', ['build'], function() {
  return gulp.src('./dist/**/test/*.js')
      .pipe(mocha({'reporter': 'nyan'}));
});
