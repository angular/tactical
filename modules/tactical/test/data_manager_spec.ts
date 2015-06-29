/// <reference path="../../../typings/chai/chai.d.ts" />
/// <reference path="../../../typings/mocha/mocha.d.ts" />

import {FakeBackend, VersionedObject} from '../src/backend';
import {TacticalDataManager} from '../src/data_manager';
import {expect} from 'chai';

describe('DataManager', () => {
  it('returns an observable for a given key that later returns data for that key', (done) => {
    var be = new FakeBackend();
    be.load(new VersionedObject('v1', {key: true}, {foo: 'hello'}));
    var dm = new TacticalDataManager(be);
    dm.request({key: true})
        .subscribe((data) => {
          expect(data['foo']).to.equal('hello');
          done();
        });
  });
  it('delivers future updates of an object', (done) => {
    var be = new FakeBackend();
    be.load(new VersionedObject('v1', {key: true}, {foo: 'hello'}));
    var dm = new TacticalDataManager(be);
    dm.request({key: true})
        .skip(1)
        .subscribe((data) => {
          expect(data['foo']).to.equal('goodbye');
          done();
        });
    be.load(new VersionedObject('v2', {key: true}, {foo: 'goodbye'}));
  });
});
