/// <reference path="../../../typings/chai/chai.d.ts" />
/// <reference path="../../../typings/mocha/mocha.d.ts" />

import {expect} from 'chai';
import {InMemoryIdbFactory} from '../src/idb';
import {
  Record,
  ErrorDM,
  ErrorITV,
  StoreError,
  StoreErrorType,
  TacticalStore,
  Version
} from '../src/tactical_store';

describe("Tactical Store", () => {

  var key: Object = {key: 'key'};
  var notkey: Object = {key: 'notkey'};

  var foobase: string = 'foobase';
  var barbase: string = 'barbase';
  var notbase: string = 'notbase';

  var foo: Object = {value: 'foo'};
  var foobaz: Object = {value: 'foobaz'};
  var bar: Object = {value: 'bar'};

  it("should fetch the most recently committed or pushed Record", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, foo, foobase)
        .flatMap((ok: boolean) => {
          expect(ok).to.be.true;
          return ts.fetch(key);
        })
        .flatMap((record: Record) => {
          expect(record.version.base).to.equal(foobase);
          expect(record.value['value']).to.equal('foo');
          return ts.commit(key, foobaz, new Version(foobase));
        })
        .flatMap((record: Record) => {
          expect(record).to.not.be.null;
          return ts.fetch(key);
        })
        .subscribeOnNext((record: Record) => {
          var mutation: Version = new Version(foobase).next;
          expect(record.version.isEqual(mutation.base, mutation.sub)).to.be.true;
          expect(record.value['value']).to.equal('foobaz');
          done();
        });
  });
  it("should fetch a specific Record", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, foo, foobase)
        .flatMap((ok: boolean) => {
          expect(ok).to.be.true;
          return ts.fetch(key, new Version(foobase));
        })
        .subscribeOnNext((record: Record) => {
          expect(record.version.base).to.equal(foobase);
          expect(record.value['value']).to.equal('foo');
          done();
        });
  });
  it("should fetch null for a non-matching key or version", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, foo, foobase)
        .flatMap((ok: boolean) => {
          expect(ok).to.be.true;
          return ts.fetch(notkey, new Version(foobase));
        })
        .flatMap((record: Record) => {
          expect(record).to.be.null;
          return ts.fetch(key, new Version(notbase));
        })
        .subscribeOnNext((record: Record) => {
          expect(record).to.be.null;
          done();
        });
  });

  it("should store a Record into the store as the most recent version", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, foo, foobase)
        .flatMap((ok: boolean) => {
          expect(ok).to.be.true;
          return ts.push(key, bar, barbase);
        })
        .flatMap((ok: boolean) => {
          expect(ok).to.be.true;
          return ts.fetch(key);
        })
        .subscribeOnNext((record: Record) => {
          expect(record.version.base).to.equal(barbase);
          expect(record.value['value']).to.equal('bar');
          done();
        });
  });
  it("should remove the previous Record, if there is no pending mutation", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, foo, foobase)
        .flatMap((ok: boolean) => {
          expect(ok).to.be.true;
          return ts.push(key, bar, barbase);
        })
        .flatMap((ok: boolean) => {
          expect(ok).to.be.true;
          return ts.fetch(key, new Version(foobase));
        })
        .subscribeOnNext((record: Record) => {
          expect(record).to.be.null;
          done();
        });
  });
  it("should throw a pending mutation error", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, foo, foobase)
        .flatMap((ok: boolean) => {
          expect(ok).to.be.true;
          return ts.commit(key, foobaz, new Version(foobase));
        })
        .flatMap((record: Record) => {
          expect(record).to.not.be.null;
          return ts.push(key, bar, barbase);
        })
        .subscribeOnError((error: StoreError) => {
          expect(error.type).to.equal(StoreErrorType.DeprecatedMutation);
          expect((<ErrorDM>error).deprecated.value['value']).to.equal('foo');
          expect((<ErrorDM>error).mutation.value['value']).to.equal('foobaz');
          expect((<ErrorDM>error).current.value['value']).to.equal('bar');
          done();
        });
  });
  it("should remove the previous pending mutation", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, foo, foobase)
        .flatMap((ok: boolean) => {
          expect(ok).to.be.true;
          return ts.commit(key, foobaz, new Version(foobase));
        })
        .flatMap((record: Record) => {
          expect(record).to.not.be.null;
          return ts.push(key, bar, barbase);
        })
        .subscribeOnError((error: StoreError) => {
          return ts.commit(key, foobaz, new Version(barbase))
              .flatMap((record: Record) => {
                expect(record).to.not.be.null;
                return ts.push(key, foo, notbase);
              })
              .subscribeOnError((otherError: StoreError) => {
                return ts.fetch(key, new Version(foobase))
                    .flatMap((record: Record) => {
                      expect(record).to.be.null;
                      var mutationVersion: Version = new Version(foobase).next;
                      return ts.fetch(key, mutationVersion);
                    })
                    .subscribeOnNext((record: Record) => {
                      expect(record).to.be.null;
                      done();
                    });
              });
        });
  });

  it("should store a pending mutation into the store", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, foo, foobase)
        .flatMap((ok: boolean) => {
          expect(ok).to.be.true;
          return ts.commit(key, foobaz, new Version(foobase));
        })
        .subscribe((record: Record) => {
          var mutation: Version = new Version(foobase).next;
          expect(record.version.isEqual(mutation.base, mutation.sub)).to.be.true;
          expect(record.value['value']).to.equal('foobaz');
          done();
        });
  });
  it("should throw an invalid target version error", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, foo, foobase)
        .flatMap((ok: boolean) => {
          expect(ok).to.be.true;
          return ts.commit(key, bar, new Version(barbase));
        })
        .subscribeOnError((error: StoreError) => {
          expect(error.type).to.equal(StoreErrorType.InvalidTargetVersion);
          expect((<ErrorITV>error).target.base).to.equal('barbase');
          expect((<ErrorITV>error).mutation['value']).to.equal('bar');
          expect((<ErrorITV>error).current.value['value']).to.equal('foo');
          done();
        });
  });
  it("should remove the previous mutation, if one exists", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, foo, foobase)
        .flatMap((ok: boolean) => {
          expect(ok).to.be.true;
          return ts.commit(key, foobaz, new Version(foobase));
        })
        .flatMap((foobazRecord: Record) => {
          expect(foobazRecord).to.not.be.null;
          return ts.commit(key, bar, foobazRecord.version)
              .map((barRecord: Record) => { return foobazRecord; });
        })
        .flatMap((record: Record) => {
          expect(record).to.not.be.null;
          return ts.fetch(key, record.version);
        })
        .subscribeOnNext((record: Record) => {
          expect(record).to.be.null;
          done();
        });
  });
  it("should emit null and not emit any errors for a non-matching key", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, foo, foobase)
        .flatMap((ok: boolean) => {
          expect(ok).to.be.true;
          return ts.commit(notkey, foobaz, new Version(foobase));
        })
        .subscribeOnNext((record: Record) => {
          expect(record).to.be.null;
          done();
        });
  });

  it("should remove the pending mutation associated with a key and base", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, foo, foobase)
        .flatMap((ok: boolean) => {
          expect(ok).to.be.true;
          return ts.commit(key, foobaz, new Version(foobase));
        })
        .flatMap((record: Record) => {
          expect(record).to.not.be.null;
          return ts.rollback(key, foobase);
        })
        .flatMap((ok: boolean) => {
          expect(ok).to.be.true;
          var mutation: Version = new Version(foobase).next;
          return ts.fetch(key, mutation);
        })
        .flatMap((record: Record) => {
          expect(record).to.be.null;
          return ts.fetch(key);
        })
        .subscribeOnNext((record: Record) => {
          var version: Version = new Version(foobase);
          expect(record.version.isEqual(version.base, version.sub)).to.be.true;
          expect(record.value['value']).to.equal('foo');
          done();
        });
  });
  it("should remove all Records associated with the base, if the provided base is not current",
     (done) => {
       var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
       ts.push(key, foo, foobase)
           .flatMap((ok: boolean) => {
             expect(ok).to.be.true;
             return ts.commit(key, foobaz, new Version(foobase));
           })
           .flatMap((record: Record) => {
             expect(record).to.not.be.null;
             return ts.push(key, bar, barbase);
           })
           .subscribeOnError((error: StoreError) => {
             ts.rollback(key, foobase)
                 .flatMap((ok: boolean) => {
                   expect(ok).to.be.true;
                   return ts.fetch(key, new Version(foobase));
                 })
                 .flatMap((record: Record) => {
                   expect(record).to.be.null;
                   var mutationVersion: Version = new Version(foobase).next;
                   return ts.fetch(key, mutationVersion);
                 })
                 .subscribeOnNext((record: Record) => {
                   expect(record).to.be.null;
                   done();
                 });
           });
     });
  it("should emit false and not emit any errors for a non-matching key or base", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, foo, foobase)
        .flatMap((ok: boolean) => {
          expect(ok).to.be.true;
          return ts.rollback(notkey, foobase);
        })
        .flatMap((ok: boolean) => {
          expect(ok).to.be.false;
          return ts.rollback(key, notbase);
        })
        .subscribeOnNext((ok: boolean) => {
          expect(ok).to.be.false;
          done();
        });
  });

  it("should emit pending mutations", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, foo, foobase)
        .flatMap((ok: boolean) => {
          expect(ok).to.be.true;
          return ts.commit(key, foobaz, new Version(foobase));
        })
        .flatMap((record: Record) => {
          expect(record).to.not.be.null;
          return ts.pending();
        })
        .subscribeOnNext((record: Record) => {
          var mutversion: Version = new Version(foobase).next;
          expect(record.version.isEqual(mutversion.base, mutversion.sub)).to.be.true;
          expect(record.value['value']).to.equal('foobaz');
          done();
        });
  });
  it("should throw deperecated mutation errors when checking for pending mutations", (done) => {
    var ts: TacticalStore = new TacticalStore(InMemoryIdbFactory);
    ts.push(key, foo, foobase)
        .flatMap((ok: boolean) => {
          expect(ok).to.be.true;
          return ts.commit(key, foobaz, new Version(foobase));
        })
        .flatMap((record: Record) => {
          expect(record).to.not.be.null;
          return ts.push(key, bar, barbase);
        })
        .subscribeOnError((error: StoreError) => {
          ts.pending().subscribeOnError((dmerror: ErrorDM) => {
            var mutversion: Version = new Version(foobase).next;
            expect(dmerror.type).to.equal(StoreErrorType.DeprecatedMutation);
            expect(dmerror.deprecated.value['value']).to.equal('foo');
            expect(dmerror.mutation.value['value']).to.equal('foobaz');
            expect(dmerror.current.value['value']).to.equal('bar');
            done();
          });
        });
  });

});
