/// <reference path="../../../typings/chai/chai.d.ts" />
/// <reference path="../../../typings/mocha/mocha.d.ts" />

import {FakeBackend, VersionedObject} from '../src/backend';
import {expect} from 'chai';

function _versioned(version: string, key: Object, data: Object): VersionedObject {
  return <VersionedObject>{version: version, key: key, data: data};
}

describe('FakeBackend', () => {
  it('delivers notices about new versions immediately, when requested', (done) => {
    var be = new FakeBackend();
    be.data().subscribe((obj) => {
      expect(obj.version).to.equal('v1');
      done();
    });
    be.load(_versioned('v1', {key: true}, {value: true}));
  });
  it('responds to a request with the latest version', (done) => {
    var be = new FakeBackend();
    be.load(_versioned('v1', {key: true}, {value: true}));
    be.data().subscribe((obj) => {
      expect(obj.version).to.equal('v1');
      done();
    });
    be.request({key: true});
  });
  it('accepts a mutation against the right version', (done) => {
    var be = new FakeBackend();
    be.load(_versioned('v1', {key: true}, {value: false}), false);
    be.data().subscribe((obj) => {
      expect(obj.version).to.equal('v1.m');
      expect(obj.data['value']).to.be.true;
      expect(obj.mutationId).to.deep.equal({id: 1});
      done();
    });
    be.mutate({key: true}, {value: true}, 'v1', {id: 1});
  });
  it('fails a mutation against the wrong version', (done) => {
    var be = new FakeBackend();
    be.load(_versioned('v2', {key: true}, {value: false}), false);
    be.data().subscribe((obj) => {
      expect(obj.version).to.equal('v2');
      expect(obj.data['value']).to.be.false;
      expect(obj.mutationId).to.be.undefined;
      done();
    });
    be.mutate({key: true}, {value: true}, 'v1', {id: 1});
  });
  it('fails a mutation on the failure path, when asked', (done) => {
    var be = new FakeBackend();
    be.load(_versioned('v1', {key: true}, {value: false}), false);
    be.failed().subscribe((obj) => {
      expect(obj.key).to.deep.equal({key: true});
      expect(obj.baseVersion).to.equal('v1');
      expect(obj.mutationId).to.deep.equal({id: 1, fail: true});
      expect(obj.reason).to.equal('Fail for test');
      done();
    });
    be.mutate({key: true}, {value: true}, 'v1', {id: 1, fail: true})
  });
});
