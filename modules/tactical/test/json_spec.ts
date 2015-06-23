/// <reference path="../../../typings/chai/chai.d.ts" />
/// <reference path="../../../typings/mocha/mocha.d.ts" />

import {serializeValue} from '../src/json';
import {expect} from 'chai';

describe('JSON serializer', () => {
  it('properly serializes a string',
     () => { expect(serializeValue('hello')).to.equal('"hello"'); });
  it('properly serializes a number', () => { expect(serializeValue(10)).to.equal('10'); });
  it('properly serializes null', () => { expect(serializeValue(null)).to.equal('null'); });
  it('properly serializes an array',
     () => { expect(serializeValue([1, 2, 3])).to.equal('[1,2,3]'); });
  it('properly serializes an object', () => {
    expect(serializeValue({foo: 'bar', baz: 'qux'})).to.equal('{"baz":"qux","foo":"bar"}');
  });
});
