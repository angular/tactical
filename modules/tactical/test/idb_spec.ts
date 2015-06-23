/// <reference path="../../../typings/chai/chai.d.ts" />
/// <reference path="../../../typings/mocha/mocha.d.ts" />

import {InMemoryIdb} from '../src/idb';
import {expect} from 'chai';

describe('InMemoryIdb', () => {
  it('can recall previously stored objects', (done) => {
    var idb = new InMemoryIdb();
    idb.put('x', 'foo', {'bar': 'baz'})
        .subscribe((v1) => {
          expect(v1).to.be.true;
          idb.get('x', 'foo')
              .subscribe((v2) => {
                expect(v2['bar']).to.equal('baz');
                done();
              });
        });
  });
  it('can differentiate between different stores', (done) => {
    var idb = new InMemoryIdb();
    idb.put('x', 'foo', {'bar': 'baz'})
        .subscribe((v1) => {
          expect(v1).to.be.true;
          idb.put('y', 'foo', {'bar': 'qux'})
              .subscribe((v2) => {
                expect(v2).to.be.true;
                idb.get('x', 'foo')
                    .subscribe((v3) => {
                      expect(v3['bar']).to.equal('baz');
                      idb.get('y', 'foo')
                          .subscribe((v4) => {
                            expect(v4['bar']).to.equal('qux');
                            done();
                          });
                    });
              });
        });
  });
  it('returns undefined for non-existent keys', (done) => {
    var idb = new InMemoryIdb();
    idb.get('x', 'not-there')
        .subscribe((v) => {
          expect(v).to.be.undefined;
          done();
        });
  });
});
