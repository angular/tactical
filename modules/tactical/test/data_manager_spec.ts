/// <reference path="../../../typings/chai/chai.d.ts" />
/// <reference path="../../../typings/mocha/mocha.d.ts" />

import {FakeBackend, VersionedObject} from '../src/backend';
import {TacticalDataManager} from '../src/data_manager';
import {NoopStore, TacticalStore} from '../src/tactical_store';
import {Record} from '../src/record';
import {InMemoryIdb} from '../src/idb';
import {expect} from 'chai';

function _versioned(version: string, key: Object, data: Object): VersionedObject {
  return <VersionedObject>{version: version, key: key, data: data};
}

describe('DataManager', () => {
  it('returns an observable for a given key that later returns data for that key', (done) => {
    var be = new FakeBackend();
    be.load(_versioned('v1', {key: true}, {foo: 'hello'}));
    var dm = new TacticalDataManager(be, new NoopStore());
    dm.request({key: true})
        .subscribe((data) => {
          expect(data['foo']).to.equal('hello');
          done();
        });
  });
  it('delivers future updates of an object', (done) => {
    var be = new FakeBackend();
    be.load(_versioned('v1', {key: true}, {foo: 'hello'}));
    var dm = new TacticalDataManager(be, new NoopStore());
    dm.request({key: true})
        .skip(1)
        .subscribe((data) => {
          expect(data['foo']).to.equal('goodbye');
          done();
        });
    be.load(_versioned('v2', {key: true}, {foo: 'goodbye'}));
  });
  it('stores new objects in TacticalStore', (done) => {
    var be = new FakeBackend();
    var ts = new TacticalStore(new InMemoryIdb());
    var dm = new TacticalDataManager(be, ts);
    be.load(_versioned('v1', {key: true}, {foo: 'hello'}));
    ts.fetch({key: true})
        .subscribe((data: Record) => {
          expect(data.version).to.equal('v1');
          expect(data.value).to.deep.equal({foo: 'hello'});
          done();
        });
  });
  it('serves from TacticalStore when available', (done) => {
    var be = new FakeBackend();
    var ts = new TacticalStore(new InMemoryIdb());
    var dm = new TacticalDataManager(be, ts);
    ts.commit({key: true}, {foo: 'goodbye'}, 'v1')
        .subscribe(() => {
          dm.request({key: true})
              .subscribe((data) => {
                expect(data['foo']).to.equal('goodbye');
                done();
              });
        });
  });
  it('serves from TacticalStore and then the backend', (done) => {
    var be = new FakeBackend();
    var ts = new TacticalStore(new InMemoryIdb());
    var dm = new TacticalDataManager(be, ts);
    be.load(_versioned('v1', {key: true}, {foo: 'goodbye'}), false);
    ts.commit({key: true}, {foo: 'hello'}, 'v1')
        .subscribe(() => {
          var first = true;
          dm.request({key: true})
              .subscribe((data) => {
                if (first) {
                  expect(data['foo']).to.equal('hello');
                  first = false;
                } else {
                  expect(data['foo']).to.equal('goodbye');
                  done();
                }
              });
        });
  });
});
