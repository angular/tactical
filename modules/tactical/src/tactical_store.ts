/// <reference path="../../../typings/rx/rx.all.d.ts" />

/**
 * Tactical Store is used to manage Tactical's working knowledge of the data model.
 * It provides a number of methods to read objects from and store objects to a persistent local
 * cache in order supply a workable offline data model for the application to use.
 *
 * Tactical expects objects to change over a lifecycle of the application. Due to this expectation,
 * the Tactical Store is prepared to store multiple distinct versions of the same object. A single
 * version of an object is referred to as a Record. Multiple Records of an object combine to form a
 * Chain.
 *
 * Chains are identified by key. Each Chain should be identifiable by a single key and each
 * key should only identify a single Chain. Records are identified by key and version. The key
 * identifies the Chain to which the Record belongs and the version identifies the Record in that
 * Chain. Each Record should be identifiable by a single combination of a key and a version and
 * each combination should identify a single Record.
 */

import {Observable, Scheduler} from 'rx';

import {Idb, IdbFactory, IdbTransaction} from './idb';
import {serializeValue} from './json';

// Types persisted in cache.
//==================================================================================================

/**
 * An explicit type to maintain versioning across a Chain that can be concisely stored in
 * cache. Implementations should be plain JS objects.
 */
export interface PlainVersion {
  base: string;  // a string provided by the backend to uniquely identify the version
  sub: number;   // the iteration of 'base' currently persisted in cache
}

/**
 * An explicit type to maintain stateful information about each Chain. Each State contains a set of
 * references to Records currently persisted in cache. Implementations should be plain JS objects.
 */
export interface ChainState {
  current: PlainVersion;     // a reference to the most recent Record stored in cache
  backup: PlainVersion;      // a duplicate of 'current' to protect against failed writes
  deprecated: PlainVersion;  // an old mutated version that hasn't been resolved by the application
}

// Key classes used to persist objects in cache.
//==================================================================================================

/**
 * A wrapper class to handle serializing keys to identify a Chain.
 */
export class ChainKey {
  private _serial: string;

  /** Instantiates a new ChainKey matching 'key'. */
  constructor(private _key: Object | string) {
    if (typeof this._key == 'string') {
      this._serial = <string>this._key;
    } else {
      this._serial = serializeValue(this._key);
    }
  }

  /** Returns the provided key object. */
  get key(): Object { return this._key; }

  /** Returns the serialization of the ChainKey. A ChainKey is only serialized at instantiation. */
  get serial(): string { return this._serial; }
}

/**
 * A wrapper class to handle serializing keys to identify a Record.
 */
export class RecordKey {
  private _serial: string;

  /** Instantiates a new RecordKey matching the provided ChainKey and Version. */
  constructor(private _key: ChainKey, private _version: Version) {
    this._serial = this._key.serial + this._version.serial;
  }

  /** Returns the provided ChainKey. */
  get chain(): ChainKey { return this._key; }

  /** Returns the provided Version. */
  get version(): Version { return this._version; }

  /**
   * Returns the serialization of the RecordKey. A RecordKey is only serialized at instantiation.
   * The ChainKey and Version are not reserialized.
   */
  get serial(): string { return this._serial; }
}

// Classes intended to be emitted by Store instances.
//==================================================================================================

/**
 * A wrapper class to provide methods Tactical Store can use to maintain versioning.
 */
export class Version {
  private _value: PlainVersion;
  private _serial: string;

  /** Returns a randomly generated integer id in the range of 1 to 2**32 (exclusive). */
  private static _randomId(): number {
    return Math.floor(Math.random() * (Math.pow(2, 32) - 1)) + 1;
  }

  /** Returns a new Version instance with the same base and sub as 'version'. */
  static from(version: PlainVersion): Version { return new Version(version.base, version.sub); }

  /**
   * Instantiates a new Version object matching the 'base' and 'sub' version. If 'sub' is not
   * provided, then the constructred Version will have an intitial sub version.
   */
  constructor(base: string, sub: number = 0) {
    this._value = {base: base, sub: sub};
    this._serial = serializeValue(this._value);
  }

  /** Returns true if this Version has a matching 'base' and (if provided) 'sub' version */
  isEqual(base: string, sub?: number): boolean {
    return (sub) ? this.base == base && this.sub == sub : this.base == base;
  }

  /** Returns true if the Version is an intitial sub version. */
  get isInitial(): boolean { return this.sub == 0; }

  /** Returns the intitial Version associated with this Version. */
  get initial(): Version { return new Version(this.base); }

  /** Returns the next sub version associated with this Version. */
  get next(): Version { return new Version(this.base, Version._randomId()); }

  /** Returns the base version. */
  get base(): string { return this._value.base; }

  /** Returns the sub version. */
  get sub(): number { return this._value.sub; }

  /** Returns the base and sub version. */
  get value(): PlainVersion { return this._value; }

  /** Returns the serialization of the Version. A Version is only serialized at instantiation. */
  get serial(): string { return this._serial; }
}

/**
 * A Record is a version of an object persisted in cache and identified by a single
 * combination of a key and a Version. The key identifies the Chain of Records for a single object
 * and the Version identifies the particular Record of that object.
 *
 * Each instance of a Record requires the object 'value' and the Version that identifies it.
 */
export class Record {
  constructor(public value: Object, public version: Version) {}
}

// Error types intended to be emitted by Store instances.
//==================================================================================================

/**
 * The range of errors that can be emitted by a Store instance.
 */
export enum StoreErrorType {
  DeprecatedMutation,
  InvalidTargetVersion
}
;

/**
 * The parent type of all errors emitted by a Store instance. The type will denote the
 * implementation of the error emitted.
 */
export interface StoreError { type: StoreErrorType; }

/**
 * The implementation of the DeprecatedMutation error type.
 */
export interface ErrorDM extends StoreError {
  initial: Record;   // Record of the deprecated initial version
  mutation: Record;  // Record of the mutation on the deprecated version
  current: Record;   // Record which is considered current by the store
}

/**
 * The implementation of the InvalidTargetVersion error type.
 */
export interface ErrorITV extends StoreError {
  target: Version;   // the Version to be mutated
  mutation: Object;  // mutation to be applied to target Version
  current: Record;   // Record which is considered current by the store
}

// Store implementations.
//==================================================================================================

/**
 * A storage backend.
 */
export interface Store {
  /**
   * Reads a Record from the store.
   *
   * If a Version is supplied, 'fetch' will emit the Record associated with that Version. Otherwise
   * 'fetch' will emit the most recently committed or pushed Record matching 'key'.
   *
   * If the 'key' or 'version' does not match any Record in the store, then 'fetch' will emit null.
   */
  fetch(key: Object, version?: Version): Observable<Record>;

  /**
   * Stores a Record into the store as the most recent version.
   *
   * If the current version has a pending mutation, 'push' will complete and throw a pending
   * mutation error (ErrorDM). Otherwise, 'push' will emit whether or not it was successful. If the
   * current version does not have a pending mutation, it will removed from the store.
   */
  push(key: Object, value: Object, base: string): Observable<boolean>;

  /**
   * Stores a pending mutation into the store as the most recent version.
   *
   * If the target version for the mutation is no longer current, 'commit' will complete and throw
   * an invalid target version error (ErrorITV). Otherwise, 'commit' will emit the Record for the
   * pending mutation.
   *
   * If the 'key' or 'version' does not match any Record in the store, 'commit' will emit null.
   */
  commit(key: Object, mutation: Object, target: Version): Observable<Record>;

  /**
   * Removes the pending mutation that matches 'key' and 'base'.
   *
   * If 'base' does not match the most recent Record, then all Records matching 'base' will be
   * removed from the store.
   *
   * If 'key' or 'base' does not match any Record in the store, then 'rollback' will emit
   * false. Otherwise, 'rollback' will emit whether or not it was successful.
   */
  rollback(key: Object, base: string): Observable<boolean>;

  /**
   * Checks if there are pending mutations in the Store and emits the Records for those mutations
   * if there are.
   *
   * If there is a deprecated mutation contained in the store, then 'pending' throw a deprecated
   * mutation error (ErrorDM). If there is pending mutation, then 'current' will be the pending
   * mutation. Otherwise, 'current' will be an initial version.
   */
  pending(): Observable<Record>;
}

/**
 * An instantiable implementation of Store. Requires an abstraction API over a persistent local
 * cache, and also accepts a custom database name to modify the storage location, in that cache,
 * for this instance of the Tactical Store to use.
 */
export class TacticalStore implements Store {
  private static _chains: string = "chains";
  private static _records: string = "records";

  private _idb: Idb;

  constructor(idbFactory: IdbFactory, appDB?: string) {
    this._idb = idbFactory((appDB) ? appDB : 'tactical_db',
                           [TacticalStore._chains, TacticalStore._records]);
  }

  /**
   * Reads a Record from the store.
   *
   * If a Version is supplied, 'fetch' will emit the Record associated with that Version. Otherwise
   * 'fetch' will emit the most recently committed or pushed Record matching 'key'.
   *
   * If the 'key' or 'version' does not match any Record in the store, then 'fetch' will emit null.
   */
  fetch(key: Object, version?: Version): Observable<Record> {
    var chainKey: ChainKey = new ChainKey(key);
    if (version) {
      return this._fetchRecord(new RecordKey(chainKey, version));
    }
    return this._idb.get(TacticalStore._chains, chainKey.serial)
        .flatMap((state: ChainState) => {
          if (!state || !state.current) {
            return Observable.just<Record>(null);
          }
          return this._fetchRecord(new RecordKey(chainKey, Version.from(state.current)))
              .flatMap((record: Record) => {
                if (record) {
                  return Observable.just<Record>(record);
                }
                if (!state.backup) {
                  return Observable.just<Record>(null);  // state is corrupted
                }
                // the chain state might be corrupted, check if a backup Record exists
                return this._fetchRecord(new RecordKey(chainKey, Version.from(state.backup)));
              });
        });
  }

  /**
   * Stores a Record into the store as the most recent version.
   *
   * If the current version has a pending mutation, 'push' will complete and throw a pending
   * mutation error (ErrorDM). Otherwise, 'push' will emit whether or not it was successful. If the
   * current version does not have a pending mutation, it will removed from the store.
   */
  push(key: Object, value: Object, base: string): Observable<boolean> {
    var pushKey: RecordKey = new RecordKey(new ChainKey(key), new Version(base));
    return this._idb.transaction([TacticalStore._chains, TacticalStore._records])
        .flatMap((transaction: IdbTransaction) => {
          return transaction.get(TacticalStore._chains, pushKey.chain.serial)
              .flatMap((state: ChainState) => {

                if (!state) {
                  state = {current: null, backup: null, deprecated: null};  // first 'push'
                }

                state.current = pushKey.version.value;  // mark that a Record is being stored

                return transaction.put(TacticalStore._chains, pushKey.chain.serial, state)
                    .flatMap((ok: boolean) => {
                      if (!ok) {
                        return Observable.just<boolean>(false);  // Idb complication
                      }
                      return transaction.put(TacticalStore._records, pushKey.serial, value);
                    })
                    .flatMap((ok: boolean) => {
                      if (!ok) {
                        return Observable.just<boolean>(false);  // state is dirty
                      }
                      if (!state.backup) {
                        return Observable.just<boolean>(true);  // first 'push'
                      }

                      var backup: Version = Version.from(state.backup);

                      // check if there is a pending mutation
                      if (!backup.isInitial) {
                        var current: Record = new Record(value, pushKey.version);
                        if (!state.deprecated) {
                          state.deprecated = backup.value;  // deprecate mutation
                          return this._throwErrorDM(pushKey.chain, backup, current);
                        }
                        // deprecations follow highlander rules; there can be only one!
                        return this._remove(transaction, pushKey.chain, state.deprecated)
                            .flatMap((ok: boolean) => {
                              if (!ok) {
                                return Observable.just<boolean>(false);  // state is dirty
                              }
                              state.deprecated = backup.value;  // deprecate mutation
                              return this._throwErrorDM(pushKey.chain, backup, current);
                            });
                      }

                      // remove the previous Record if there is no pending mutation
                      return this._remove(transaction, pushKey.chain, backup.value);
                    })
                    .flatMap((ok: boolean) => {
                      if (!ok) {
                        return Observable.just<boolean>(false);  // state is dirty
                      }
                      state.backup = pushKey.version.value;  // finalize Record
                      return transaction.put(TacticalStore._chains, pushKey.chain.serial, state);
                    });
              });
        })
        .take(1);
  }

  /**
   * Stores a pending mutation into the store as the most recent version.
   *
   * If the target version for the mutation is no longer current, 'commit' will complete and throw
   * an invalid target version error (ErrorITV). Otherwise, 'commit' will emit the Record for the
   * pending mutation.
   *
   * If the 'key' or 'version' does not match any Record in the store, 'commit' will emit null.
   */
  commit(key: Object, mutation: Object, target: Version): Observable<Record> {
    var targetKey: RecordKey = new RecordKey(new ChainKey(key), target);
    return this._idb.transaction([TacticalStore._chains, TacticalStore._records])
        .flatMap((transaction: IdbTransaction) => {
          return transaction.get(TacticalStore._chains, targetKey.chain.serial)
              .flatMap((state: ChainState) => {

                if (!state || !state.current) {
                  return Observable.just<Record>(null);
                }

                // mutation should target the current version
                if (!target.isEqual(state.current.base, state.current.sub)) {
                  return this._throwErrorITV(key, mutation, target);
                }

                var mutRcd: Record = new Record(mutation, target.next);
                var mutKey: RecordKey = new RecordKey(targetKey.chain, mutRcd.version);
                state.current = mutRcd.version.value;  // mark that a Record is being stored

                return transaction.put(TacticalStore._chains, targetKey.chain.serial, state)
                    .flatMap((ok: boolean) => {
                      if (!ok) {
                        return Observable.just<boolean>(false);  // Idb complication
                      }
                      return transaction.put(TacticalStore._records, mutKey.serial, mutation);
                    })
                    .flatMap((ok: boolean) => {
                      if (!ok) {
                        return Observable.just<boolean>(false);  // state is dirty
                      }
                      if (target.isInitial) {
                        return Observable.just<boolean>(true);  // don't remove intial versions
                      }
                      // mutations follow highlander rules; there can be only one!
                      return transaction.remove(TacticalStore._records, targetKey.serial);
                    })
                    .flatMap((ok: boolean) => {
                      if (!ok) {
                        return Observable.just<boolean>(false);  // state is dirty
                      }
                      state.backup = mutRcd.version.value;  // finalize Record
                      return this._idb.put(TacticalStore._chains, targetKey.chain.serial, state);
                    })
                    .map((ok: boolean) => (ok) ? mutRcd : null);
              });
        })
        .take(1);
  }

  /**
   * Removes the pending mutation that matches 'key' and 'base'.
   *
   * If 'base' does not match the most recent Record, then all Records matching 'base' will be
   * removed from the store.
   *
   * If 'key' or 'base' does not match any Record in the store, then 'rollback' will emit
   * false. Otherwise, 'rollback' will emit whether or not it was successful.
   */
  rollback(key: Object, base: string): Observable<boolean> {
    var chainKey: ChainKey = new ChainKey(key);
    var target: Version = new Version(base);
    return this._idb.transaction([TacticalStore._chains, TacticalStore._records])
        .flatMap((transaction: IdbTransaction) => {
          return transaction.get(TacticalStore._chains, chainKey.serial)
              .flatMap((state: ChainState) => {

                if (!state || !state.current) {
                  return Observable.just<boolean>(false);
                }

                // check if 'rollback' was called on the 'deprecated' version
                if (!target.isEqual(state.current.base)) {
                  if (!state.deprecated || !target.isEqual(state.deprecated.base)) {
                    return Observable.just<boolean>(false);  // invalid target
                  }
                  // calling 'rollback' on a 'deprecated' base is equivalent to removing it
                  return this._remove(transaction, chainKey, state.deprecated)
                      .flatMap((ok: boolean) => {
                        if (!ok) {
                          return Observable.just<boolean>(false);  // state is dirty
                        }
                        state.deprecated = null;
                        return this._idb.put(TacticalStore._chains, chainKey.serial, state);
                      });
                }

                if (Version.from(state.current).isInitial) {
                  return Observable.just<boolean>(true);
                }

                state.current = target.value;  // mark that a Record is being stored

                return transaction.put(TacticalStore._chains, chainKey.serial, state)
                    .flatMap((ok: boolean) => {
                      if (!ok) {
                        return Observable.just<boolean>(false);  // Idb complication
                      }
                      // remove the pending mutation
                      var mutKey: RecordKey = new RecordKey(chainKey, Version.from(state.backup));
                      return transaction.remove(TacticalStore._records, mutKey.serial)
                          .flatMap((ok: boolean) => {
                            if (!ok) {
                              return Observable.just<boolean>(false);  // state is dirty
                            }
                            state.backup = target.value;  // finalize Record
                            return transaction.put(TacticalStore._chains, chainKey.serial, state);
                          });
                    });
              });
        })
        .take(1);
  }

  /**
   * Checks if there are pending mutations in the Store and emits the Records for those mutations
   * if there are.
   *
   * If there is a deprecated mutation contained in the store, then 'pending' throw a deprecated
   * mutation error (ErrorDM). If there is pending mutation, then 'current' will be the pending
   * mutation. Otherwise, 'current' will be an initial version.
   */
  pending(): Observable<Record> {
    return this._idb.keys(TacticalStore._chains)
        .flatMap((key: string) => {
          var chainKey: ChainKey = new ChainKey(key);

          return this._idb.get(TacticalStore._chains, chainKey.serial)
              .take(1)
              .flatMap((state: ChainState) => {

                if (!state || !state.current) {
                  return Observable.just<Record>(null);
                }

                var current: Version = Version.from(state.current);

                // check if there is a deprecated mutation
                if (state.deprecated) {
                  return this._fetchRecord(new RecordKey(chainKey, current))
                      .flatMap((currentRcd: Record) => {
                        var deprecated: Version = Version.from(state.deprecated);
                        return this._throwErrorDM(chainKey, deprecated, currentRcd);
                      });
                }

                // check if there is a pending mutation
                if (!current.isInitial) {
                  return this._fetchRecord(new RecordKey(chainKey, current));
                }

                return Observable.empty<Record>();
              });
        });
  }

  /**
   * Reads a Record from the store.
   *
   * If the 'key' does not match any Record in the store, then '_fetchRecord' will emit null.
   */
  private _fetchRecord(key: RecordKey): Observable<Record> {
    return this._idb.get(TacticalStore._records, key.serial)
        .map((value: Object) => { return (value) ? new Record(value, key.version) : null; })
        .take(1);
  }

  /**
   * Returns an Observable that will emit a deprecated mutation error.
   */
  private _throwErrorDM(key: ChainKey, mutation: Version, current: Record): Observable<any> {
    var initRcd: Observable<Record> = this._fetchRecord(new RecordKey(key, mutation.initial));
    var mutRcd: Observable<Record> = this._fetchRecord(new RecordKey(key, mutation));
    return initRcd.forkJoin(mutRcd, (left: Record, right: Record) => {
                    var error: ErrorDM = {
                      type: StoreErrorType.DeprecatedMutation,
                      initial: left,
                      mutation: right,
                      current: current
                    };
                    return error;
                  }).flatMap((error: ErrorDM) => { return Observable.throw<any>(error); });
  }

  /**
   * Returns an Observable that will emit a invalid target version error.
   */
  private _throwErrorITV(key: Object, mutation: Object, target: Version): Observable<any> {
    return this.fetch(key).flatMap((record: Record) => {
      var error: ErrorITV = {
        type: StoreErrorType.InvalidTargetVersion,
        target: target,
        mutation: mutation,
        current: record
      };
      return Observable.throw<any>(error);
    });
  }

  /**
   * Removes the Records from the store matching 'key' and 'version', including the initial
   * version.
   *
   * If the provided 'key' or 'version' are non-matching, '_remove' will emit true. Otherwise,
   * '_remove' will emit whether or not it was successful.
   */
  private _remove(transaction: IdbTransaction, key: ChainKey,
                  version: PlainVersion): Observable<boolean> {
    var mutKey: RecordKey = new RecordKey(key, Version.from(version));
    if (mutKey.version.isInitial) {
      return transaction.remove(TacticalStore._records, mutKey.serial).take(1);
    }
    var initKey: RecordKey = new RecordKey(key, mutKey.version.initial);
    return transaction.remove(TacticalStore._records, mutKey.serial)
        .take(1)
        .forkJoin(transaction.remove(TacticalStore._records, initKey.serial).take(1),
                  (left: boolean, right: boolean) => { return left && right; });
  }
}

/**
 * An implementation of a Store that does nothing.
 */
export class NoopStore implements Store {
  fetch(key: Object, version?: Version): Observable<Record> {
    return Observable.just<Record>(null, Scheduler.currentThread);
  }

  push(key: Object, value: Object, base: string): Observable<boolean> {
    return Observable.just<boolean>(true, Scheduler.currentThread);
  }

  commit(key: Object, mutation: Object, target: Version): Observable<Record> {
    return Observable.just<Record>(null, Scheduler.currentThread);
  }

  rollback(key: Object, base: string): Observable<boolean> {
    return Observable.just<boolean>(true, Scheduler.currentThread);
  }

  pending(): Observable<Record> { return Observable.empty<Record>(Scheduler.currentThread); }
}
