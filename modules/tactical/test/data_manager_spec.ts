/// <reference path="../../../typings/chai/chai.d.ts" />
/// <reference path="../../../typings/mocha/mocha.d.ts" />

import {FakeBackend, VersionedObject} from '../src/backend';
import {TacticalDataManager} from '../src/data_manager';
import {expect} from 'chai';

function _versioned(version: string, key: Object, data: Object): VersionedObject {
  return <VersionedObject>{version: version, key: key, data: data};
}

describe('DataManager', () => {
  it('returns an observable for a given key that later returns data for that key', (done) => {
    var be = new FakeBackend();
    be.load(_versioned('v1', {key: true}, {foo: 'hello'}));
    var dm = new TacticalDataManager(be);
    dm.request({key: true})
        .subscribe((data) => {
          expect(data['foo']).to.equal('hello');
          done();
        });
  });
  it('delivers future updates of an object', (done) => {
    var be = new FakeBackend();
    be.load(_versioned('v1', {key: true}, {foo: 'hello'}));
    var dm = new TacticalDataManager(be);
    dm.request({key: true})
        .skip(1)
        .subscribe((data) => {
          expect(data['foo']).to.equal('goodbye');
          done();
        });
    be.load(_versioned('v2', {key: true}, {foo: 'goodbye'}));
  });
});
