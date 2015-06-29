/// <reference path="../../../typings/chai/chai.d.ts" />
/// <reference path="../../../typings/mocha/mocha.d.ts" />

import {Link} from '../src/link';
import {expect} from 'chai';

describe('Link observable wrapper', () => {
  it('transmits events posted to it via its observable', (done) => {
    var link = new Link<string>();
    link.observable.subscribe((v) => {
      expect(v).to.equal('hello');
      done();
    });
    link.send('hello');
  });
  it('produces a hot observable', (done) => {
    var link = new Link<string>();
    var seen = false;
    link.observable.subscribe((v) => {
      if (!seen) {
        seen = true;
        link.observable.subscribe((v) => {
          expect(v).to.equal('goodbye');
          done();
        });
        expect(v).to.equal('hello');
      } else {
        expect(v).to.equal('goodbye');
      }
    });
    link.send('hello');
    link.send('goodbye');
  });
  it('gets notified whenever all subscribers disconnect', (done) => {
    var link = new Link<string>();
    link.observable.take(1).subscribe((v) => { expect(v).to.equal('hello'); });
    var goodbye = false;
    link.observable.skip(1).take(1).subscribe((v) => {
                                     expect(v).to.equal('goodbye');
                                     goodbye = true;
                                   }) link.onDisconnect = () => {
      expect(goodbye).to.be.true;
      done();
    };
    link.send('hello');
    link.send('goodbye');
  });
});