/// <reference path="../../../typings/chai/chai.d.ts" />
/// <reference path="../../../typings/mocha/mocha.d.ts" />
import {expect} from 'chai';

import {Idb, InMemoryIdb} from '../src/idb';
import {serializeValue} from '../src/json';
import {ChainKey, RecordKey, TacticalStore} from '../src/tactical_store';
import {Record} from '../src/record';


describe("ChainKey", () => {
  
  var key: Object = {key: 'id'}
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
    var mockIdb: Idb = new InMemoryIdb();
    var tacStore: TacticalStore = new TacticalStore(mockIdb);
    
    tacStore.commit(fooKey.chain.key, fooValue, fooKey.version).subscribe(
      (ok: boolean) => {
        if (ok) {
          mockIdb.get("tac_records_", fooKey.serial).subscribe(
            (value: Object) => {
              expect(value['foo']).to.equal(fooValue['foo']);
              done();
            },
            (err: any) => {
              done(err);
            }
          );
        } else {
          throw expect(ok).to.be.true;
        }
      },
      (err: any) => {
        done(err);
      }
    );
  });
  
  it("should store multiple Records in a single Chain", (done) => {
    var mockIdb: Idb = new InMemoryIdb();
    var tacStore: TacticalStore = new TacticalStore(mockIdb);
    
    tacStore.commit(fooKey.chain.key, fooValue, fooKey.version).subscribe(
      (ok: boolean) => {
        if (ok) {
          tacStore.commit(barKey.chain.key, barValue, barKey.version).subscribe(
            (ok: boolean) => {
              if (ok) {
                mockIdb.get("tac_records_", fooKey.serial).subscribe(
                  (value: Object) => {
                    expect(value['foo']).to.equal(fooValue['foo']);
                    
                    mockIdb.get("tac_records_", barKey.serial).subscribe(
                      (otherValue: Object) => {
                        expect(otherValue['foo']).to.equal(barValue['foo']);
                        done();
                      },
                      (err: any) => {
                        done(err);
                      }
                    );
                  },
                  (err: any) => {
                    done(err);
                  }
                );
              } else {
                throw expect(ok).to.be.true;
              }
            },
            (err: any) => {
              done(err);
            }
          );
        } else {
          throw expect(ok).to.be.true;
        }
      },
      (err: any) => {
        done(err);
      }
    );
  });

  it("should return the most recent Record when passed only a key", (done) => {
    var mockIdb: Idb = new InMemoryIdb();
    var tacStore: TacticalStore = new TacticalStore(mockIdb);
    
    tacStore.commit(fooKey.chain.key, fooValue, fooKey.version).subscribe(
      (ok: boolean) => {
        if (ok) {
         tacStore.commit(barKey.chain.key, barValue, barKey.version).subscribe(
            (ok: boolean) => {
              if (ok) {
                tacStore.fetch(chainKey.key).subscribe(
                  (record: Record) => {
                    expect(record.version).to.equal(barKey.version);
                    expect(record.value['foo']).to.equal(barValue['foo']);
                    done();
                  },
                  (err: any) => {
                    done(err);
                  }
                );
              } else {
                throw expect(ok).to.be.true;
              }
            },
            (err: any) => {
              done(err);
            }
          );
        } else {
          throw expect(ok).to.be.true;
        }
      },
      (err: any) => {
        done(err);
      }
    );
  });
  
  it("should return null with a non-matching key", (done) => {
    var mockIdb: Idb = new InMemoryIdb();
    var tacStore: TacticalStore = new TacticalStore(mockIdb);
    var otherKey: ChainKey = new ChainKey({key: 'otherId'});
    
    tacStore.commit(fooKey.chain.key, fooValue, fooKey.version).subscribe(
      (ok: boolean) => {
        if (ok) {
          tacStore.fetch(otherKey.key).subscribe(
            (record: Record) => {
              expect(record).to.be.null;
              done();
            },
            (err: any) => {
              done(err);
            }
          );
        } else {
          throw expect(ok).to.be.true;
        }
      },
      (err: any) => {
        done(err);
      }
    );
  });
  
  it("should return the correct Record when passed a key and a version", (done) => {
    var mockIdb: Idb = new InMemoryIdb();
    var tacStore: TacticalStore = new TacticalStore(mockIdb);
    
    tacStore.commit(fooKey.chain.key, fooValue, fooKey.version).subscribe(
      (ok: boolean) => {
        if (ok) {
          tacStore.commit(barKey.chain.key, barValue, barKey.version).subscribe(
            (ok: boolean) => {
              if (ok) {
                tacStore.fetch(fooKey.chain.key, fooKey.version).subscribe(
                  (record: Record) => {
                    expect(record.version).to.equal(fooKey.version);
                    expect(record.value['foo']).to.equal(fooValue['foo']);
                    
                    tacStore.fetch(barKey.chain.key, barKey.version).subscribe(
                      (otherRecord: Record) => {
                        expect(otherRecord.version).to.equal(barKey.version);
                        expect(otherRecord.value['foo']).to.equal(barValue['foo']);
                        done();
                      },
                      (err: any) => {
                        done(err);
                      }
                    );
                  },
                  (err: any) => {
                    done(err);
                  }
                );
              } else {
                throw expect(ok).to.be.true;
              }
            },
            (err: any) => {
              done(err);
            }
          );
        } else {
          throw expect(ok).to.be.true;
        }
      },
      (err: any) => {
        done(err);
      }
    );
  });
  
  it("should return null with a non-matching version", (done) => {
    var mockIdb: Idb = new InMemoryIdb();
    var tacStore: TacticalStore = new TacticalStore(mockIdb);
    
    tacStore.commit(fooKey.chain.key, fooValue, fooKey.version).subscribe(
      (ok: boolean) => {
        if (ok) {
          tacStore.fetch(fooKey.chain.key, barKey.version).subscribe(
            (record: Record) => {
              expect(record).to.be.null;
              done();
            },
            (err: any) => {
              done(err);
            }
          );
        } else {
          throw expect(ok).to.be.true;
        }
      },
      (err: any) => {
        done(err);
      }
    );
  });
  
  it("should use the store provided", (done) => {
    var mockIdb: Idb = new InMemoryIdb();
    var tacStore: TacticalStore = new TacticalStore(mockIdb, "test");
    
    tacStore.commit(fooKey.chain.key, fooValue, fooKey.version).subscribe(
      (ok: boolean) => {
        if (ok) {
          mockIdb.get("tac_records_test", fooKey.serial).subscribe(
            (value: Object) => {
              expect(value['foo']).to.equal(fooValue['foo']);
              done();
            },
            (err: any) => {
              done(err);
            }
          );
        } else {
          throw expect(ok).to.be.true;
        }
      },
      (err: any) => {
        done(err);
      }
    );
  });
  
});
