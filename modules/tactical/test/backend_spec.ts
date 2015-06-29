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
});
