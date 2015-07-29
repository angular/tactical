/// <reference path="../../../typings/chai/chai.d.ts" />
/// <reference path="../../../typings/mocha/mocha.d.ts" />

import {FakeBackend, VersionedObject} from '../src/backend';
import {TacticalDataManager} from '../src/data_manager';
import {NoopStore, Record, TacticalStore} from '../src/tactical_store';
import {InMemoryIdbFactory} from '../src/idb';
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
    var ts = new TacticalStore(InMemoryIdbFactory);
    var dm = new TacticalDataManager(be, ts);
    be.load(_versioned('v1', {key: true}, {foo: 'hello'}));
    ts.fetch({key: true})
        .subscribe((data: Record) => {
          expect(data.version.base).to.equal('v1');
          expect(data.value).to.deep.equal({foo: 'hello'});
          done();
        });
  });
  it('serves from TacticalStore when available', (done) => {
    var be = new FakeBackend();
    var ts = new TacticalStore(InMemoryIdbFactory);
    var dm = new TacticalDataManager(be, ts);
    ts.push({key: true}, 'v1', {foo: 'goodbye'})
        .defaultIfEmpty()
        .flatMap(() => dm.request({key: true}))
        .subscribe((data: Object) => {
          expect(data['foo']).to.equal('goodbye');
          done();
        });
  });
  it('serves from TacticalStore and then the backend', (done) => {
    var be = new FakeBackend();
    var ts = new TacticalStore(InMemoryIdbFactory);
    var dm = new TacticalDataManager(be, ts);
    be.load(_versioned('v1', {key: true}, {foo: 'goodbye'}), false);
    var first = true;
    ts.push({key: true}, 'v1', {foo: 'hello'})
        .defaultIfEmpty()
        .flatMap(() => dm.request({key: true}))
        .subscribe((data: Object) => {
          if (first) {
            expect(data['foo']).to.equal('hello');
            first = false;
          } else {
            expect(data['foo']).to.equal('goodbye');
            done();
          }
        });
  });
  it('pushes mutations to the TacticalStore', (done) => {
    var be = new FakeBackend();
    var ts = new TacticalStore(InMemoryIdbFactory);
    var dm = new TacticalDataManager(be, ts);
    be.load(_versioned('v1', {key: true}, {foo: 'hello'}), false);
    dm.beginUpdate({key: true})
        .take(1)
        .subscribe((updater) => {
          expect(updater.value).to.deep.equal({foo: 'hello'});
          updater.value['foo'] = 'goodbye';
          updater.commit().subscribe((ok) => {
            expect(ok).to.be.true;
            ts.fetch({key: true})
                .subscribe((data) => {
                  expect(data.value).to.deep.equal({foo: 'goodbye'});
                  expect(data.version.base).to.equal('v1');
                  expect(data.version.sub).to.not.equal(0);
                  done();
                });
          });
        });
  });
});
