/// <reference path="../../../typings/chai/chai.d.ts" />
/// <reference path="../../../typings/mocha/mocha.d.ts" />

import {expect} from 'chai';

import {Idb, InMemoryIdbFactory} from '../src/idb';
import {serializeValue} from '../src/json';
import {ChainKey, RecordKey, TacticalStore} from '../src/tactical_store';
import {Record} from '../src/record';


describe("ChainKey", () => {

  var key: Object = {key: 'id'};
  var chainKey: ChainKey = new ChainKey(key);

  it("should contain the key that was provided", (done) => {
    expect(chainKey.key['key']).to.equal(key['key']);
    done();
  });

  it("should serialize the key provided", (done) => {
    expect(chainKey.serial).to.equal(serializeValue(key));
    done();
  });

});

describe("RecordKey", () => {

  var version: string = 'foo';
  var chainKey: ChainKey = new ChainKey({key: 'id'});
  var recordKey: RecordKey = new RecordKey(version, chainKey);

  it("should contain provided version and provided key", (done) => {
    expect(recordKey.version).to.equal(version);
    expect(recordKey.chain.key['key']).to.equal(chainKey.key['key']);
    done();
  });

  it("should return the serialized string of the version and key", (done) => {
    expect(recordKey.serial).to.equal(version + chainKey.serial);
    done();
  });

});

describe("Tactical Store", () => {

  var chainKey: ChainKey = new ChainKey({key: 'id'});
  var fooValue: Object = {foo: 'foo'};
  var fooKey: RecordKey = new RecordKey('foo', chainKey);
  var barValue: Object = {foo: 'bar'};
  var barKey: RecordKey = new RecordKey('bar', chainKey);

  it("should store new Records", (done) => {
    var tacStore: TacticalStore = new TacticalStore(InMemoryIdbFactory);

    tacStore.commit(fooKey.chain.key, fooValue, fooKey.version)
        .flatMap((ok: boolean) => {
          expect(ok).to.be.true;
          return tacStore.fetch(chainKey.key);
        })
        .subscribe((record: Record) => {
          expect(record.value['foo']).to.equal(fooValue['foo']);
          done();
        });
  });

  it("should complete after servicing a commit request", (done) => {
    var tacStore: TacticalStore = new TacticalStore(InMemoryIdbFactory);

    tacStore.commit(fooKey.chain.key, fooValue, fooKey.version)
        .subscribeOnCompleted(() => { done(); });
  });

  it("should complete after servicing a fetch request", (done) => {
    var tacStore: TacticalStore = new TacticalStore(InMemoryIdbFactory);

    tacStore.commit(fooKey.chain.key, fooValue, fooKey.version)
        .flatMap((ok: boolean) => { return tacStore.fetch(chainKey.key); })
        .subscribeOnCompleted(() => { done(); });
  });

  it("should return the most recent Record when passed only a key", (done) => {
    var tacStore: TacticalStore = new TacticalStore(InMemoryIdbFactory);

    tacStore.commit(fooKey.chain.key, fooValue, fooKey.version)
        .flatMap((ok: boolean) => {
          expect(ok).to.be.true;
          return tacStore.commit(barKey.chain.key, barValue, barKey.version);
        })
        .flatMap((ok: boolean) => {
          expect(ok).to.be.true;
          return tacStore.fetch(chainKey.key);
        })
        .subscribe((record: Record) => {
          expect(record.version).to.equal(barKey.version);
          expect(record.value['foo']).to.equal(barValue['foo']);
          done();
        });
  });

  it("should return null with a non-matching key", (done) => {
    var tacStore: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    var otherKey: ChainKey = new ChainKey({key: 'otherId'});

    tacStore.commit(fooKey.chain.key, fooValue, fooKey.version)
        .flatMap((ok: boolean) => {
          expect(ok).to.be.true;
          return tacStore.fetch(otherKey.key);
        })
        .subscribe((record: Record) => {
          expect(record).to.be.null;
          done();
        });
  });

  it("should return the correct Record when passed a key and a version", (done) => {
    var tacStore: TacticalStore = new TacticalStore(InMemoryIdbFactory);

    tacStore.commit(fooKey.chain.key, fooValue, fooKey.version)
        .flatMap((ok: boolean) => {
          expect(ok).to.be.true;
          return tacStore.commit(barKey.chain.key, barValue, barKey.version);
        })
        .flatMap((ok: boolean) => {
          expect(ok).to.be.true;
          return tacStore.fetch(fooKey.chain.key, fooKey.version);
        })
        .flatMap((record: Record) => {
          expect(record.version).to.equal(fooKey.version);
          expect(record.value['foo']).to.equal(fooValue['foo']);
          return tacStore.fetch(barKey.chain.key, barKey.version);
        })
        .subscribe((record: Record) => {
          expect(record.version).to.equal(barKey.version);
          expect(record.value['foo']).to.equal(barValue['foo']);
          done();
        });
  });

  it("should return null with a non-matching version", (done) => {
    var tacStore: TacticalStore = new TacticalStore(InMemoryIdbFactory);

    tacStore.commit(fooKey.chain.key, fooValue, fooKey.version)
        .flatMap((ok: boolean) => {
          expect(ok).to.be.true;
          return tacStore.fetch(fooKey.chain.key, barKey.version);
        })
        .subscribe((record: Record) => {
          expect(record).to.be.null;
          done();
        });
  });

});
