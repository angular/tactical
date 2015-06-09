/// <reference path="../../../typings/chai/chai.d.ts" />
/// <reference path="../../../typings/mocha/mocha.d.ts" />

import {
  SetPropertiesMutation,
  SubPropertyMutation,
  ArrayValueMutation,
  ArrayTruncationMutation,
  ArraySubMutation
} from '../src/mutation';
import {expect} from 'chai';

describe('SetPropertiesMutation', () => {
  it('sets properties that both exist and do not exist on an object', () => {
    var obj = {'foo': 'old foo value', 'bar': 'old bar value'};
    var changes = {'foo': 'new foo value', 'baz': 'new baz value'};
    var mutation = new SetPropertiesMutation(changes);
    expect(mutation.apply(obj)).to.be.true;
    expect(obj)
        .to.deep.equal({'foo': 'new foo value', 'bar': 'old bar value', 'baz': 'new baz value'});
  });
  it('will overwrite a sub-object with a primitive value', () => {
    var obj = {'foo': {'bar': 'baz'}};
    var mutation = new SetPropertiesMutation({'foo': 42});
    expect(mutation.apply(obj)).to.be.true;
    expect(obj).to.deep.equal({'foo': 42});
  });
  it('will overwrite a primitive value with a sub-object', () => {
    var obj = {'foo': 42};
    var changes = {'foo': {'bar': 'baz'}};
    var mutation = new SetPropertiesMutation(changes);
    expect(mutation.apply(obj)).to.be.true;
    expect(obj).to.deep.equal({'foo': {'bar': 'baz'}});
  });
  it('will overwrite one sub-object with another', () => {
    var obj = {'foo': {'bar': 'baz'}};
    var changes = {'foo': {'other': 'new value'}};
    var mutation = new SetPropertiesMutation(changes);
    expect(mutation.apply(obj)).to.be.true;
    expect(obj).to.deep.equal({'foo': {'other': 'new value'}});
  });
  it('does not apply for null objects', () => {
    var mutation = new SetPropertiesMutation({'key': 'value'});
    expect(mutation.apply(null)).to.be.false;
  });
});

describe('SubPropertyMutation', () => {
  it('applies child mutations', () => {
    var obj = {
      'alpha': {'version': 1, 'other': 1, 'foo': 'bar'},
      'beta': {'version': 1, 'other': 1, 'foo': 'baz'}
    };
    var children =
        [new SetPropertiesMutation({'version': 2}), new SetPropertiesMutation({'other': 3})];
    var mutation = new SubPropertyMutation('alpha', children);
    expect(mutation.apply(obj)).to.be.true;
    expect(obj).to.deep.equal({
      'alpha': {'version': 2, 'other': 3, 'foo': 'bar'},
      'beta': {'version': 1, 'other': 1, 'foo': 'baz'}
    });
  });
  it('does not apply when the child key does not exist', () => {
    var obj = {'foo': 42};
    var children = [new SetPropertiesMutation({'shouldFail': true})];
    var mutation = new SubPropertyMutation('bar', children);
    expect(mutation.apply(obj)).to.be.false;
  });
});

describe('ArrayValueMutation', () => {
  it('can change a value in an array', () => {
    var obj = [1, 2, 3];
    var mutation = new ArrayValueMutation(1, 0);
    expect(mutation.apply(obj)).to.be.true;
    expect(obj[1]).to.equal(0);
  });
  it('can append a value to an array', () => {
    var obj = [1, 2, 3];
    var mutation = new ArrayValueMutation(3, 4);
    expect(mutation.apply(obj)).to.be.true;
    expect(obj[3]).to.equal(4);
  });
  it('does not apply when the target is not an array', () => {
    var mutation = new ArrayValueMutation(0, 1);
    expect(mutation.apply({})).to.be.false;
  });
});

describe('ArrayTruncationMutation', () => {
  it('truncates an array', () => {
    var obj = [1, 2, 3, 4];
    var mutation = new ArrayTruncationMutation(3);
    expect(mutation.apply(obj)).to.be.true;
    expect(obj.length).to.equal(3);
    expect(obj).to.deep.equal([1, 2, 3]);
  });
  it('does not apply when the array is too short already', () => {
    var obj = [1];
    var mutation = new ArrayTruncationMutation(3);
    expect(mutation.apply(obj)).to.be.false;
  });
  it('does not apply when the target is not an array', () => {
    var mutation = new ArrayTruncationMutation(3);
    expect(mutation.apply({})).to.be.false;
  });
});

describe('ArraySubMutation', () => {
  it('applies mutations to a value in the array', () => {
    var obj = [{}, {}];
    var children = [new SetPropertiesMutation({'foo': true})];
    var mutation = new ArraySubMutation(1, children);
    expect(mutation.apply(obj)).to.be.true;
    expect(obj[1]['foo']).to.be.true;
  });
  it('does not apply when the target is not an array', () => {
    var mutation = new ArraySubMutation(0, []);
    expect(mutation.apply({})).to.be.false;
  });
  it('does not apply when the index does not exist in the target array', () => {
    var obj = [{}, {}];
    var mutation = new ArraySubMutation(3, []);
    expect(mutation.apply(obj)).to.be.false;
  });
});
