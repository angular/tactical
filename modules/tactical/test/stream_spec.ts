/// <reference path="../../../typings/chai/chai.d.ts" />
/// <reference path="../../../typings/mocha/mocha.d.ts" />

import {Stream} from '../src/stream';
import {expect} from 'chai';

describe('Stream observable wrapper', () => {
  it('passes values to subscribers', done => {
    var s = new Stream<string>();
    var i = 0;
    s.observable.subscribe(val => {
      expect(val).to.equal('hello');
      if (i++ == 1) {
        done();
      }
    });
    s.observable.subscribe(val => {
      expect(val).to.equal('hello');
      if (i++ == 1) {
        done();
      }
    });
    s.send('hello');
  });
  it('delivers previous value if available', done => {
    var s = new Stream<string>();
    s.send('hello');
    s.observable.subscribe(val => {
      expect(val).to.equal('hello');
      done();
    });
  });
  it('notifies when all subscribers disconnect', done => {
    var called = false;
    var s = new Stream<string>(() => {
      expect(called).to.be.true;
      done();
    });
    s.observable.take(1).subscribe(val => { expect(val).to.equal('hello'); });
    s.observable.skip(1).take(1).subscribe(val => {
      called = true;
      expect(val).to.equal('goodbye');
    });
    s.send('hello');
    s.send('goodbye');
  });
});
