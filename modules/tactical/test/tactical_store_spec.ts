/// <reference path="../../../typings/chai/chai.d.ts" />
/// <reference path="../../../typings/mocha/mocha.d.ts" />

import {expect} from 'chai';
import {InMemoryIdbFactory} from '../src/idb';
import {
  KeyNotFoundError,
  InvalidInitialTargetVersionError,
  OutdatedMutation,
  OutdatedTargetVersionError,
  PendingMutation,
  Record,
  TacticalStore,
  Version
} from '../src/tactical_store';

import {Scheduler} from 'rx';

describe("Tactical Store", () => {

  var key: Object = {key: 'key'};
  var notKey: Object = {key: 'notkey'};

  var fooVer: Version = new Version('foobase');
  var barVer: Version = new Version('barbase');
  var notVer: Version = new Version('notbase');

  var foo: Object = {value: 'foo'};
  var foobaz: Object = {value: 'foobaz'};
  var bar: Object = {value: 'bar'};

  var emptyCntxt: Object = {};
  var fooCntxt: Object = {time: 'footime'};
  var barCntxt: Object = {time: 'bartime'};

  it("fetch should emit the most recently committed or pushed Record", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, fooVer.base, foo)
        .defaultIfEmpty()
        .flatMap(() => ts.fetch(key))
        .flatMap((record: Record) => {
          expect(record.version.isEqual(fooVer)).to.be.true;
          expect(record.value).to.deep.equal(foo);
          expect(record.context).to.deep.equal(emptyCntxt);
          return ts.commit(key, fooVer, foobaz, fooCntxt);
        })
        .defaultIfEmpty()
        .flatMap(() => ts.fetch(key))
        .subscribeOnNext((record: Record) => {
          expect(record.version.base).to.equal(fooVer.base);
          expect(record.value).to.deep.equal(foobaz);
          expect(record.context).to.deep.equal(fooCntxt);
          done();
        });
  });
  it("fetch should emit a specific Record", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, fooVer.base, foo)
        .defaultIfEmpty()
        .flatMap(() => ts.fetch(key, fooVer))
        .subscribeOnNext((record: Record) => {
          expect(record.version.isEqual(fooVer)).to.be.true;
          expect(record.value).to.deep.equal(foo);
          expect(record.context).to.deep.equal(emptyCntxt);
          done();
        });
  });
  it("fetch should emit null for a non-matching key or version", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, fooVer.base, foo)
        .defaultIfEmpty()
        .flatMap(() => ts.fetch(notKey, fooVer))
        .flatMap((record: Record) => {
          expect(record).to.be.null;
          return ts.fetch(key, notVer);
        })
        .subscribeOnNext((record: Record) => {
          expect(record).to.be.null;
          done();
        });
  });
  it("push should store a Record as the most recent version", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, fooVer.base, foo)
        .defaultIfEmpty()
        .flatMap(() => ts.push(key, barVer.base, bar))
        .defaultIfEmpty()
        .flatMap(() => ts.fetch(key))
        .subscribeOnNext((record: Record) => {
          expect(record.version.isEqual(barVer)).to.be.true;
          expect(record.value).to.deep.equal(bar);
          expect(record.context).to.deep.equal(emptyCntxt);
          done();
        });
  });
  it("push should remove the previous Record, if it is not a pending mutation", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, fooVer.base, foo)
        .defaultIfEmpty()
        .flatMap(() => ts.push(key, barVer.base, bar))
        .defaultIfEmpty()
        .flatMap(() => ts.fetch(key, fooVer))
        .subscribeOnNext((record: Record) => {
          expect(record).to.be.null;
          done();
        });
  });
  it("push should remove the previous Record, if it has been resolved", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, fooVer.base, foo)
        .defaultIfEmpty()
        .flatMap(() => ts.commit(key, fooVer, foobaz, fooCntxt))
        .subscribeOn(Scheduler.default)
        .subscribe();
    ts.pending.take(1)
        .flatMap((pending: PendingMutation) => {
          return ts.push(key, barVer.base, bar, pending.mutation.version)
              .defaultIfEmpty()
              .flatMap(() => ts.fetch(key, pending.mutation.version));
        })
        .flatMap((record: Record) => {
          expect(record).to.be.null;
          return ts.fetch(key, fooVer);
        })
        .subscribeOnNext((record: Record) => {
          expect(record).to.be.null;
          done();
        });
  });
  it("push should emit an outdated mutation on the outdated stream", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, fooVer.base, foo)
        .defaultIfEmpty()
        .flatMap(() => ts.commit(key, fooVer, foobaz, fooCntxt))
        .defaultIfEmpty()
        .flatMap(() => ts.push(key, barVer.base, bar))
        .subscribeOn(Scheduler.default)
        .subscribe();
    ts.outdated.subscribeOnNext((outdated: OutdatedMutation) => {
      expect(outdated.key).to.deep.equal(key);
      expect(outdated.initial.version.isEqual(fooVer)).to.be.true;
      expect(outdated.initial.value).to.deep.equal(foo);
      expect(outdated.initial.context).to.deep.equal(emptyCntxt);
      expect(outdated.mutation.version.base).to.equal(fooVer.base);
      expect(outdated.mutation.value).to.deep.equal(foobaz);
      expect(outdated.mutation.context).to.deep.equal(fooCntxt);
      expect(outdated.current.version.isEqual(barVer)).to.be.true;
      expect(outdated.current.value).to.deep.equal(bar);
      expect(outdated.current.context).to.deep.equal(emptyCntxt);
      done();
    });
  });
  // TODO(Ian): "should append outdated mutation"
  it("commit should store a pending mutation into the store", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, fooVer.base, foo)
        .defaultIfEmpty()
        .flatMap(() => ts.commit(key, fooVer, foobaz, fooCntxt))
        .defaultIfEmpty()
        .flatMap(() => ts.fetch(key))
        .subscribeOnNext((record: Record) => {
          expect(record.version.base).to.equal(fooVer.base);
          expect(record.value).to.deep.equal(foobaz);
          expect(record.context).to.deep.equal(fooCntxt);
          done();
        });
  });
  it("commit should emit a pending mutation on the pending stream", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, fooVer.base, foo)
        .defaultIfEmpty()
        .flatMap(() => ts.commit(key, fooVer, foobaz, fooCntxt))
        .subscribeOn(Scheduler.default)
        .subscribe();
    ts.pending.take(1).subscribeOnNext((pending: PendingMutation) => {
      expect(pending.key).to.deep.equal(key);
      expect(pending.mutation.version.base).to.equal(fooVer.base);
      expect(pending.mutation.value).to.deep.equal(foobaz);
      expect(pending.mutation.context).to.deep.equal(fooCntxt);
      done();
    });
  });
  it("commit should remove the previous mutation, if one exists", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, fooVer.base, foo)
        .defaultIfEmpty()
        .flatMap(() => ts.commit(key, fooVer, foobaz, fooCntxt))
        .subscribeOn(Scheduler.default)
        .subscribe();
    ts.pending.take(1)
        .flatMap((pending: PendingMutation) => {
          return ts.commit(key, pending.mutation.version, bar, barCntxt)
              .defaultIfEmpty()
              .flatMap(() => ts.fetch(key, pending.mutation.version));
        })
        .subscribeOnNext((record: Record) => {
          expect(record).to.be.null;
          done();
        });
  });
  it("commit should throw a KeyNotFoundError for a non-matching key", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, fooVer.base, foo)
        .defaultIfEmpty()
        .flatMap(() => ts.commit(notKey, fooVer, foobaz, fooCntxt))
        .subscribeOnError((error: KeyNotFoundError) => {
          expect(error.key).to.deep.equal(notKey);
          done();
        });
  });
  it("commit should throw an outdated target version error for a non-current target version",
     (done) => {
       var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
       ts.push(key, fooVer.base, foo)
           .defaultIfEmpty()
           .flatMap(() => ts.commit(key, notVer, foobaz, fooCntxt))
           .subscribeOnError((error: OutdatedTargetVersionError) => {
             expect(error.key).to.deep.equal(key);
             expect(error.current.isEqual(fooVer)).to.be.true;
             expect(error.target.isEqual(notVer)).to.be.true;
             expect(error.mutation).to.deep.equal(foobaz);
             expect(error.context).to.deep.equal(fooCntxt);
             done();
           });
     });
  it("abandon should remove the pending mutation associated with a specific key and version",
     (done) => {
       var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
       ts.push(key, fooVer.base, foo)
           .defaultIfEmpty()
           .flatMap(() => ts.commit(key, fooVer, foobaz, {}))
           .subscribeOn(Scheduler.default)
           .subscribe();
       ts.pending.take(1)
           .flatMap((pending: PendingMutation) => {
             return ts.abandon(key, pending.mutation.version)
                 .defaultIfEmpty()
                 .flatMap(() => ts.fetch(key, pending.mutation.version));
           })
           .flatMap((record: Record) => {
             expect(record).to.be.null;
             return ts.fetch(key);
           })
           .subscribeOnNext((record: Record) => {
             expect(record.version.isEqual(fooVer)).to.be.true;
             expect(record.value).to.deep.equal(foo);
             expect(record.context).to.deep.equal(emptyCntxt);
             done();
           });
     });
  it("abandon should throw an InvalidInitialTargetVersionError, if provided an initial version",
     (done) => {
       var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
       ts.push(key, fooVer.base, foo)
           .defaultIfEmpty()
           .flatMap(() => ts.abandon(key, fooVer))
           .subscribeOnError((error: InvalidInitialTargetVersionError) => {
             expect(error.key).to.deep.equal(key);
             expect(error.target.isEqual(fooVer)).to.be.true;
             done();
           });
     });
  it("abandon should remove all Records associated with the version, if the provided version is not current",
     (done) => {
       var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
       ts.push(key, fooVer.base, foo)
           .defaultIfEmpty()
           .flatMap(() => ts.commit(key, fooVer, foobaz, fooCntxt))
           .defaultIfEmpty()
           .flatMap(() => ts.push(key, barVer.base, bar))
           .subscribeOn(Scheduler.default)
           .subscribe();
       ts.outdated.take(1)
           .flatMap((outdated: OutdatedMutation) => {
             return ts.abandon(key, outdated.mutation.version)
                 .defaultIfEmpty()
                 .flatMap(() => ts.fetch(key, outdated.mutation.version));
           })
           .flatMap((record: Record) => {
             expect(record).to.be.null;
             return ts.fetch(key, fooVer);
           })
           .subscribeOnNext((record: Record) => {
             expect(record).to.be.null;
             done();
           });
     });
  it("abandon should throw a KeyNotFoundError for a non-matching key", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, fooVer.base, foo)
        .defaultIfEmpty()
        .flatMap(() => ts.commit(key, fooVer, foobaz, fooCntxt))
        .subscribeOn(Scheduler.default)
        .subscribe();
    ts.pending.take(1)
        .flatMap((pending: PendingMutation) => ts.abandon(notKey, pending.mutation.version))
        .subscribeOnError((error: KeyNotFoundError) => {
          expect(error.key).to.deep.equal(notKey);
          done();
        });
  });
});
