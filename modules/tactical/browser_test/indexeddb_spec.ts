/// <reference path="../../../typings/chai/chai.d.ts" />
/// <reference path="../../../typings/mocha/mocha.d.ts" />

import {Idb, IndexedDBFactory} from '../src/idb';
import {expect} from 'chai';

describe('IndexedDB', function() {
  var idb: Idb = IndexedDBFactory('test', ['x', 'y']);

  it('can recall previously stored objects', (done) => {
    idb.put('x', 'foo', {'bar': 'baz'})
        .flatMap((v1: boolean) => {
          expect(v1).to.be.true;
          return idb.get('x', 'foo');
        })
        .subscribe((v2: Object) => {
          expect(v2['bar']).to.equal('baz');
          done();
        });
  });

  it('can differentiate between different stores', (done) => {
    idb.put('x', 'foo', {'bar': 'baz'})
        .flatMap((v1: boolean) => {
          expect(v1).to.be.true;
          return idb.put('y', 'foo', {'bar': 'qux'});
        })
        .flatMap((v2: boolean) => {
          expect(v2).to.be.true;
          return idb.get('x', 'foo');
        })
        .flatMap((v3: Object) => {
          expect(v3['bar']).to.equal('baz');
          return idb.get('y', 'foo');
        })
        .subscribe((v4: Object) => {
          expect(v4['bar']).to.equal('qux');
          done();
        });
  });

  it('returns undefined for non-existent keys', (done) => {
    idb.get('x', 'not-there')
        .subscribe((v: Object) => {
          expect(v).to.be.undefined;
          done();
        });
  });

});