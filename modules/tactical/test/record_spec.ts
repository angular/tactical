/// <reference path="../../../typings/chai/chai.d.ts" />
/// <reference path="../../../typings/mocha/mocha.d.ts" />
import {expect} from 'chai';

import {serializeValue} from '../src/json';
import {Record} from '../src/record';


describe("Record", () => {
  
  var version: string = 'foo';
  var value: Object = {foo: 'foo'};
  var record: Record = new Record(version, value);
  
  it("should contain the provided version and the provided value", (done) => {
    expect(record.version).to.equal(version);
    expect(record.value['foo']).to.equal(value['foo']);
    done();
  });
  
});
