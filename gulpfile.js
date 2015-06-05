var cp = require('child_process');
var gulp = require('gulp');
var gulpTsc = require('gulp-typescript');

// ==========
// config

var tsProject = gulpTsc.createProject('./tsconfig.json', {
    typescript: require('typescript')
  });


// ==========
// needed to execute local commands

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


// ==========
// compile

gulp.task('install.typings', function(done) {
  exec('./node_modules/tsd/build/cli.js', ['reinstall'], done);
})

gulp.task('build', ['install.typings'], function(done) {
  var tsResult = gulp.src('./modules/**/*.ts')
      .pipe(gulpTsc(tsProject));
  return tsResult.js.pipe(gulp.dest(tsProject.options.outDir));
});
