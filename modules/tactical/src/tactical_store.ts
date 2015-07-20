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

import {Idb, IdbFactory} from './idb';
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
  get next(): Version { return new Version(this.base, this.sub + 1); }

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
  deprecated: Record;  // Record of the deprecated version
  mutation: Record;    // Record of the mutation on the deprecated version
  current: Record;     // Record which is considered current by the store
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
        .take(1)
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
                  // if operations are isolated, this should never happen
                  return Observable.just<Record>(null);
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
    return this._idb.get(TacticalStore._chains, pushKey.chain.serial)
        .take(1)
        .flatMap((state: ChainState) => {
          if (!state) {
            state = {current: null, backup: null, deprecated: null};
          }
          // mark that a new Record is being persisted
          state.current = pushKey.version.value;
          return this._idb.put(TacticalStore._chains, pushKey.chain.serial, state)
              .take(1)
              .flatMap((ok: boolean) => {
                if (!ok) {
                  // 'push' failed due to complication with idb
                  return Observable.just<boolean>(false);
                }
                return this._idb.put(TacticalStore._records, pushKey.serial, value)
                    .take(1)
                    .flatMap((ok: boolean) => {
                      if (!ok) {
                        // chain state is now corrupted: 'current' references a null Record
                        return Observable.just<boolean>(false);
                      }
                      // if operations are AI, this should only happen at first 'push'
                      if (!state.backup) {
                        return Observable.just<boolean>(true);
                      }
                      var backupKey: RecordKey =
                          new RecordKey(pushKey.chain, Version.from(state.backup));
                      // check if there is a current pending mutation
                      if (!backupKey.version.isInitial) {
                        // throw a deprecated mutation error
                        return this._fetchRecord(backupKey).flatMap((backup: Record) => {
                          if (!backup) {
                            // should only happen if the chain state is corrupted
                            return Observable.just<boolean>(true);
                          }
                          var deprecatedKey: RecordKey =
                              new RecordKey(backupKey.chain, backupKey.version.initial);
                          return this._fetchRecord(deprecatedKey)
                              .flatMap((deprecated: Record) => {
                                if (!deprecated) {
                                  // if operations are AI, this should never happen
                                  return Observable.just<boolean>(false);
                                }
                                var current: Record = new Record(value, pushKey.version);
                                var error: ErrorDM = {
                                  type: StoreErrorType.DeprecatedMutation,
                                  deprecated: deprecated,
                                  mutation: backup,
                                  current: current
                                };
                                if (!state.deprecated) {
                                  // mark the current pending mutation as 'deprecated'
                                  state.deprecated = backup.version.value;
                                  return Observable.throw<boolean>(error);
                                }
                                // deprecated mutations follow highlander rules; there can be only
                                // one!
                                var depVersion: Version = Version.from(state.deprecated);
                                return this._remove(pushKey.chain, depVersion.initial, depVersion)
                                    .map((ok: boolean) => {
                                      if (!ok) {
                                        // chain state is corrupted: 'deprecated' Records still
                                        // exist
                                        return false;
                                      }
                                      // move pending mutation to 'deprecated'
                                      state.deprecated = backup.version.value;
                                      return true;
                                    })
                                    .merge(Observable.throw<boolean>(error));
                              });
                        });
                      }
                      // remove the previous Record if there is no pending mutation
                      return this._remove(backupKey.chain, backupKey.version);
                    });
              })
              .flatMap((ok: boolean) => {
                // mark new Record as finalized
                state.backup = pushKey.version.value;
                return this._idb.put(TacticalStore._chains, pushKey.chain.serial, state).take(1);
              });
        });
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
    return this._idb.get(TacticalStore._chains, targetKey.chain.serial)
        .take(1)
        .flatMap((state: ChainState) => {
          if (!state || !state.current) {
            // can't commit against an empty chain
            return Observable.just<Record>(null);
          }
          // check that the mutation is against the current version
          if (!target.isEqual(state.current.base, state.current.sub)) {
            return this.fetch(key).flatMap((record: Record) => {
              // throw an invalid target version error
              var error: ErrorITV = {
                type: StoreErrorType.InvalidTargetVersion,
                target: target,
                mutation: mutation,
                current: record
              };
              return Observable.throw<Record>(error);
            });
          }
          var mutKey: RecordKey = new RecordKey(targetKey.chain, target.next);
          var mutRecord: Record = new Record(mutation, mutKey.version);
          // mark that a new Record is being persisted
          state.current = mutKey.version.value;
          return this._idb.put(TacticalStore._chains, targetKey.chain.serial, state)
              .take(1)
              .flatMap((ok: boolean) => {
                if (!ok) {
                  // 'commit' failed due to idb complication
                  return Observable.just<boolean>(false);
                }
                return this._idb.put(TacticalStore._records, mutKey.serial, mutation)
                    .take(1)
                    .flatMap((ok: boolean) => {
                      if (!ok) {
                        // chain state is corrupted: 'current' references a null Record
                        return Observable.just<boolean>(false);
                      }
                      // don't remove initial versions
                      if (target.sub == 0) {
                        return Observable.just<boolean>(true);
                      }
                      // mutations follow highlander rules; there can be only one!
                      return this._remove(targetKey.chain, targetKey.version);
                    });
              })
              .flatMap((ok: boolean) => {
                if (!ok) {
                  return Observable.just<boolean>(false);
                }
                // mark new Record as finalized
                state.backup = mutKey.version.value;
                return this._idb.put(TacticalStore._chains, targetKey.chain.serial, state).take(1);
              })
              .map((ok: boolean) => { return (ok) ? mutRecord : null; });
        });
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
    return this._idb.get(TacticalStore._chains, chainKey.serial)
        .take(1)
        .flatMap((state: ChainState) => {
          if (!state || !state.current) {
            // can't rollback an empty chain
            return Observable.just<boolean>(false);
          }
          // check if 'rollback' was called on the 'current' version
          if (!target.isEqual(state.current.base)) {
            if (!state.deprecated || !target.isEqual(state.deprecated.base)) {
              // can't rollback a version that doesn't exist
              return Observable.just<boolean>(false);
            }
            // calling 'rollback' on a 'deprecated' base is equivalent to removing it
            return this._remove(chainKey, target, Version.from(state.deprecated))
                .flatMap((ok: boolean) => {
                  if (!ok) {
                    // chain state is corrupted: 'deprecated' Records still exist
                    return Observable.just<boolean>(false);
                  }
                  state.deprecated = null;
                  return this._idb.put(TacticalStore._chains, chainKey.serial, state).take(1);
                });
          }
          if (Version.from(state.current).isInitial) {
            // no need to 'rollback' an initial version
            return Observable.just<boolean>(true);
          }
          // mark that the initial version is being made 'current'
          state.current = target.value;
          return this._idb.put(TacticalStore._chains, chainKey.serial, state)
              .take(1)
              .flatMap((ok: boolean) => {
                if (!ok) {
                  // 'rollback' failed due to idb complication
                  return Observable.just<boolean>(false);
                }
                // remove the pending mutation
                return this._remove(chainKey, Version.from(state.backup))
                    .flatMap((ok: boolean) => {
                      if (!ok) {
                        // chain state is corrupted: 'backup' references a null Record
                        return Observable.just<boolean>(false);
                      }
                      // mark the initial version is finalized
                      state.backup = target.value;
                      return this._idb.put(TacticalStore._chains, chainKey.serial, state).take(1);
                    });
              });
        });
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
          var chainkey: ChainKey = new ChainKey(key);
          return this._idb.get(TacticalStore._chains, chainkey.serial)
              .take(1)
              .flatMap((state: ChainState) => {
                var currversion: Version = Version.from(state.current);
                // check if there is a deprecated mutation
                if (state.deprecated) {
                  // throw a deprecated mutation error
                  var depversion: Version = Version.from(state.deprecated);
                  return this._fetchRecord(new RecordKey(chainkey, depversion))
                      .flatMap((depmutation: Record) => {
                        return this._fetchRecord(new RecordKey(chainkey, depversion.initial))
                            .flatMap((deprecated: Record) => {
                              return this._fetchRecord(new RecordKey(chainkey, currversion))
                                  .flatMap((current: Record) => {
                                    var error: ErrorDM = {
                                      type: StoreErrorType.DeprecatedMutation,
                                      deprecated: deprecated,
                                      mutation: depmutation,
                                      current: current
                                    };
                                    return Observable.throw<Record>(error);
                                  });
                            });
                      });
                }
                // check if there is a pending mutation
                if (!currversion.isInitial) {
                  return this._fetchRecord(new RecordKey(chainkey, currversion));
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
        .take(1)
        .map((value: Object) => { return (value) ? new Record(value, key.version) : null; });
  }

  /**
   * Removes one or two Records from the store.
   *
   * Removes the Record matching 'key' and 'v1' from the store. If 'v2' is provided, the Record
   * matching 'key' and 'v2' will also be removed from the store.
   *
   * If the provided 'key' or Versions are non-matching, '_remove' will emit true. Otherwise,
   * '_remove' will emit whether or not it was successful.
   */
  private _remove(key: ChainKey, v1: Version, v2?: Version): Observable<boolean> {
    var v1Key: RecordKey = new RecordKey(key, v1);
    if (!v2) {
      // only remove the first version
      return this._idb.remove(TacticalStore._records, v1Key.serial).take(1);
    }
    // remove both versions
    var v2Key: RecordKey = new RecordKey(key, v2);
    return this._idb.remove(TacticalStore._records, v1Key.serial)
        .take(1)
        .forkJoin(this._idb.remove(TacticalStore._records, v2Key.serial).take(1),
                  (v1Removed: boolean, v2Removed: boolean) => { return v1Removed && v2Removed; });
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
