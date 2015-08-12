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

import {Observable, Subject, Scheduler} from 'rx';

import {Idb, IdbFactory, IdbTransaction} from './idb';
import {serializeValue} from './json';

// Types persisted in cache.
//==================================================================================================

/**
 * Maintains stateful information about each Chain. Each State contains a set of references to
 * Records currently persisted in cache.
 */
export interface ChainState {
  current: PlainVersion;     // a reference to the most recent Record stored in cache
  outdated: PlainVersion[];  // a list of old mutated versions that haven't been resolved by the
                             // application
}

/**
 * Maintains contextual information associated with each Record that is persisted in cache.
 */
export interface Entry {
  context: Object;  // the contextual data associated with the Record
  value: Object;    // the value of the Record
}

/**
 * Maintains versioning across a Chain.
 */
export interface PlainVersion {
  base: string;  // a string provided by the backend to uniquely identify the version
  sub: number;   // the iteration of 'base' currently persisted in cache
}

// Key classes used to persist objects in cache.
//==================================================================================================

/**
 * Handles serializing keys to identify a Chain.
 */
export class ChainKey {
  private _serial: string;

  /** Instantiates a new ChainKey matching 'key'. */
  constructor(private _key: Object | string) {
    if (typeof this._key == 'string') {
      this._serial = <string>this._key;
      this._key = JSON.parse(<string>this._key);
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
 * Handles serializing keys to identify a Record.
 */
export class RecordKey {
  private _serial: string;

  /** Instantiates a new RecordKey matching the provided ChainKey and Version. */
  constructor(private _key: ChainKey, private _version: Version) {
    this._serial = this._key.serial + this._version.serial;
  }

  /** Returns the provided ChainKey. */
  get chain(): ChainKey { return this._key; }

  /**
   * Returns the serialization of the RecordKey. A RecordKey is only serialized at instantiation.
   * The ChainKey and Version are not reserialized.
   */
  get serial(): string { return this._serial; }

  /** Returns the provided Version. */
  get version(): Version { return this._version; }
}

// Classes intended to be emitted by Store instances.
//==================================================================================================

/**
 * Contains the information necessary to resolve an outdated mutation.
 */
export class OutdatedMutation {
  /**
   * Contains the associated 'key' object, a Record of the 'current' version in the Store, a Record
   * of
   * the outdated 'mutation', and a Record of the 'initial' version of the 'mutation'.
   */
  constructor(public key: Object, public current: Record, public mutation: Record,
              public initial: Record) {}
}

/**
 * Contains the information necessary to resolve a pending mutation.
 */
export class PendingMutation {
  /**
   * Contains the associated 'key' object, and a Record of the pending 'mutation'.
   */
  constructor(public key: Object, public mutation: Record) {}
}

/**
 * A Record is a version of an object persisted in cache and identified by a single
 * combination of a key and a Version. The key identifies the Chain of Records for a single object
 * and the Version identifies the particular Record of that object.
 */
export class Record {
  /**
   * Contains the 'version' of the Record, the 'value' associated with that 'version', and 'context'
   * information associated with that 'version'.
   */
  constructor(public version: Version, public value: Object, public context: Object = {}) {}
}

/**
 * Maintains versioning for the Store.
 */
export class Version {
  private _value: PlainVersion;
  private _serial: string;

  /** Returns a new Version instance with the same base and sub as 'version'. */
  static from(version: PlainVersion): Version { return new Version(version.base, version.sub); }

  /** Returns a randomly generated integer id in the range of 1 to 2**32 (exclusive). */
  private static _randomId(): number {
    return Math.floor(Math.random() * (Math.pow(2, 32) - 1)) + 1;
  }

  /**
   * Instantiates a new Version object matching the 'base' and 'sub' version. If 'sub' is not
   * provided, then the constructred Version will have an intitial sub version.
   */
  constructor(base: string, sub: number = 0) {
    this._value = {base: base, sub: sub};
    this._serial = serializeValue(this._value);
  }

  /** Returns the base version. */
  get base(): string { return this._value.base; }

  /** Returns the intitial Version associated with this Version. */
  get initial(): Version { return new Version(this.base); }

  /** Returns true if the Version is an intitial sub version. */
  get isInitial(): boolean { return this.sub == 0; }

  /** Returns the next sub version associated with this Version. */
  get next(): Version { return new Version(this.base, Version._randomId()); }

  /** Returns the serialization of the Version. A Version is only serialized at instantiation. */
  get serial(): string { return this._serial; }

  /** Returns the sub version. */
  get sub(): number { return this._value.sub; }

  /** Returns the base and sub version. */
  get value(): PlainVersion { return this._value; }

  /** Returns true if this Version has a matching 'base' and 'sub' to 'other'. */
  isEqual(other: Version): boolean { return this.base == other.base && this.sub == other.sub; }
}

// Error types intended to be emitted by Store instances.
//==================================================================================================

/**
 * Thrown when a method uses a provided key that has no matching Chain in the Store.
 */
export class KeyNotFoundError {
  /** Contains the non-matching 'key'. */
  constructor(public key: Object) {}
}

/**
 * Throw when an 'abandon' targets an initial Version.
 */
export class InvalidInitialTargetVersionError {
  /** Contains the 'key' and the invalid initial 'target' Version. */
  constructor(public key: Object, public target: Version) {}
}
/**
 * Thrown when a 'commit' targets a Version that does not match the most current Record.
 */
export class OutdatedTargetVersionError {
  /**
   * Contains the 'key' for the 'mutation', the Version that is 'current' in the Store, the Version
   * that
   * was the 'target' of the 'mutation', the 'mutation' that was to be applied, and the 'context'
   * information associated with the 'mutation'.
   */
  constructor(public key: Object, public current: Version, public target: Version,
              public mutation: Object, public context: Object) {}
}

// Store implementations.
//==================================================================================================

/**
 * A storage backend.
 */
export interface Store {
  /** A stream of outdated mutations emitted by the Store. */
  outdated: Observable<OutdatedMutation>;

  /** A stream of pending mutations emitted by the Store. */
  pending: Observable<PendingMutation>;

  /**
   * Removes the 'target' Version from the Store.
   *
   * If the 'target' Version is an initial Version, then 'abandon' will throw an
   * InvalidInitialTargetVersionError.
   *
   * If the 'target' Version does not match the Version that is current in the Store, then the
   * 'target' Version and any Records associated with it will be removed from the Store.
   *
   * If the 'key' does not match any Record in the Store, 'abandon' will throw a KeyNotFoundError.
   *
   * 'abandon' will complete when the affected Records are removed from the Store.
   */
  abandon(key: Object, target: Version): Observable<void>;

  /**
   * Stores a pending mutation into the Store as the most recent version. The pending mutation will
   * be emitted on the 'pending' stream.
   *
   * If there is a previous pending mutation attached to the current Version, it will be
   * replaced with 'mutation'.
   *
   * If the 'key' does not match any Record in the Store, 'commit' will throw a KeyNotFoundError.
   *
   * If the 'target' Version for the 'mutation' is no longer current, 'commit' will throw
   * an OutdatedTargetVersionError.
   */
  commit(key: Object, target: Version, mutation: Object, context: Object): Observable<void>;

  /**
   * Reads a Record from the Store.
   *
   * If a Version is supplied, 'fetch' will emit the Record associated with that Version. Otherwise
   * 'fetch' will emit the most recently 'commit'ted or 'push'ed Record matching 'key'.
   *
   * If the 'key' or 'version' does not match any Record in the Store, then 'fetch' will emit null.
   */
  fetch(key: Object, version?: Version): Observable<Record>;

  /**
   * Stores a Record into the Store as the most recent version.
   *
   * If the current Record is not a pending mutation or if the current Record matches 'resolves',
   * it will be removed from the Store.
   *
   * If the current Record is a pending mutation, 'push' will emit an OutdatedMutation on the
   * 'outdated' stream.
   */
  push(key: Object, base: string, value: Object, resolves?: Version): Observable<void>;
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
  private _outdated: Subject<OutdatedMutation> = new Subject<OutdatedMutation>();
  private _pending: Subject<PendingMutation> = new Subject<PendingMutation>();

  /**
   * Takes a factory function used to generate an Idb implementation and a name
   * to use, if any, for the target database.
   */
  constructor(idbFactory: IdbFactory, appDB?: string) {
    this._idb = idbFactory((appDB) ? appDB : 'tactical_db',
                           [TacticalStore._chains, TacticalStore._records]);
  }

  get outdated(): Observable<OutdatedMutation> { return this._outdated; }

  get pending(): Observable<PendingMutation> { return this._pending; }

  abandon(key: Object, target: Version): Observable<void> {
    var targetKey: RecordKey = new RecordKey(new ChainKey(key), target);
    return this._idb.transaction([TacticalStore._chains, TacticalStore._records])
        .flatMap((txn: IdbTransaction) => {
          return txn.get(TacticalStore._chains, targetKey.chain.serial)
              .flatMap((state: ChainState) => {
                if (!state) {
                  throw new KeyNotFoundError(key);
                }
                if (!state.current) {
                  return Observable.empty<void>();
                }
                if (target.isInitial) {
                  throw new InvalidInitialTargetVersionError(key, target);
                }
                var current: Version = Version.from(state.current);
                var res = Observable.just<boolean>(true);
                if (target.isEqual(current)) {
                  state.current = current.initial.value;
                  res = txn.remove(TacticalStore._records, targetKey.serial);
                } else {
                  for (var i = 0; i < state.outdated.length; i++) {
                    if (target.isEqual(Version.from(state.outdated[i]))) {
                      state.outdated.splice(i, 1);
                      break;
                    }
                  }
                  res = this._removeBase(targetKey, txn);
                }
                return res.flatMap(
                              () => txn.put(TacticalStore._chains, targetKey.chain.serial, state))
                    .flatMap(() => Observable.empty<void>());
              });
        });
  }

  commit(key: Object, target: Version, mutation: Object, context: Object): Observable<void> {
    var targetKey: RecordKey = new RecordKey(new ChainKey(key), target);
    return this._idb.transaction([TacticalStore._chains, TacticalStore._records])
        .flatMap((txn: IdbTransaction) => {
          return txn.get(TacticalStore._chains, targetKey.chain.serial)
              .flatMap((state: ChainState) => {
                if (!state || !state.current) {
                  throw new KeyNotFoundError(key);
                }
                var previousVersion: Version = Version.from(state.current);
                if (!target.isEqual(previousVersion)) {
                  throw new OutdatedTargetVersionError(key, previousVersion, target, mutation,
                                                       context);
                }
                var mutationKey: RecordKey = new RecordKey(targetKey.chain, previousVersion.next);
                state.current = mutationKey.version.value;
                var res = txn.put(TacticalStore._chains, mutationKey.chain.serial, state)
                              .flatMap(() => txn.put(TacticalStore._records, mutationKey.serial,
                                                     {value: mutation, context: context}));
                if (!previousVersion.isInitial) {
                  res = res.flatMap(() => txn.remove(TacticalStore._records, targetKey.serial));
                }
                return res.flatMap(() => {
                  this._pending.onNext(
                      new PendingMutation(key, new Record(mutationKey.version, mutation, context)));
                  return Observable.empty<void>();
                });
              });
        });
  }

  fetch(key: Object, version?: Version): Observable<Record> {
    var chainKey: ChainKey = new ChainKey(key);
    if (version) {
      return this._fetchRecord(new RecordKey(chainKey, version));
    }
    return this._idb.transaction([TacticalStore._chains, TacticalStore._records])
        .flatMap((txn: IdbTransaction) => {
          return txn.get(TacticalStore._chains, chainKey.serial)
              .flatMap((state: ChainState) => {
                if (!state || !state.current) {
                  return Observable.just<Record>(null);
                }
                return this._fetchRecord(new RecordKey(chainKey, Version.from(state.current)), txn);
              });
        });
  }

  push(key: Object, base: string, value: Object, resolves?: Version): Observable<void> {
    var pushKey: RecordKey = new RecordKey(new ChainKey(key), new Version(base));
    return this._idb.transaction([TacticalStore._chains, TacticalStore._records])
        .flatMap((txn: IdbTransaction) => {
          return txn.get(TacticalStore._chains, pushKey.chain.serial)
              .flatMap((state: ChainState) => {
                var previousVersion: Version;
                if (!state) {
                  state = {current: null, outdated: []};  // first 'push'
                } else {
                  previousVersion = Version.from(state.current);
                }
                state.current = pushKey.version.value;
                var isOutdated: boolean = previousVersion && !previousVersion.isInitial;
                var isResolved: boolean = resolves && previousVersion.isEqual(resolves);
                if (isOutdated && !isResolved) {
                  state.outdated.push(previousVersion.value);
                }
                return txn.put(TacticalStore._chains, pushKey.chain.serial, state)
                    .flatMap(() => txn.put(TacticalStore._records, pushKey.serial,
                                           {value: value, context: {}}))
                    .flatMap(() => {
                      var res = Observable.just<boolean>(true);
                      if (previousVersion && !previousVersion.isEqual(pushKey.version)) {
                        if (previousVersion.isInitial || isResolved) {
                          res =
                              this._removeBase(new RecordKey(pushKey.chain, previousVersion), txn);
                        } else if (!isResolved) {
                          res = this._emitOutdatedMutation(
                              new RecordKey(pushKey.chain, previousVersion),
                              new Record(pushKey.version, value), txn)
                        }
                      }
                      return res.flatMap(() => Observable.empty<void>());
                    });
              });
        });
  }

  /**
   * Emits an outdated mutation on the 'outdated' stream.
   */
  private _emitOutdatedMutation(mutationKey: RecordKey, current: Record,
                                txn: IdbTransaction): Observable<boolean> {
    return this._fetchRecord(mutationKey, txn)
        .flatMap((mutation: Record) => {
          return this._fetchRecord(new RecordKey(mutationKey.chain, mutationKey.version.initial),
                                   txn)
              .map((initial: Record) =>
                       new OutdatedMutation(mutationKey.chain.key, current, mutation, initial));
        })
        .map((outdatedMutation: OutdatedMutation) => {
          this._outdated.onNext(outdatedMutation);
          return true;
        });
  }

  /**
   * Reads a Record from the Store.
   *
   * If the 'key' does not match any Record in the Store, then '_fetchRecord' will emit null.
   */
  private _fetchRecord(key: RecordKey, txn?: IdbTransaction): Observable<Record> {
    return ((txn) ? Observable.just<IdbTransaction>(txn) :
                    this._idb.transaction([TacticalStore._records]))
        .flatMap((txn: IdbTransaction) => txn.get(TacticalStore._records, key.serial))
        .map((entry: Entry) =>
                 (entry) ? new Record(key.version, entry.value, entry.context) : null);
  }

  /**
   * Removes the Record of the mutation and the Record of the initial specified by the
   * provided 'targetKey'.
   */
  private _removeBase(targetKey: RecordKey, txn: IdbTransaction): Observable<boolean> {
    var res = txn.remove(TacticalStore._records, targetKey.serial);
    if (!targetKey.version.isInitial) {
      var initKey: RecordKey = new RecordKey(targetKey.chain, targetKey.version.initial);
      res = res.flatMap(() => txn.remove(TacticalStore._records, initKey.serial));
    }
    return res;
  }
}

/**
 * An implementation of a Store that does nothing.
 */
export class NoopStore implements Store {
  get outdated(): Observable<OutdatedMutation> {
    return Observable.empty<OutdatedMutation>(Scheduler.default);
  }

  get pending(): Observable<PendingMutation> {
    return Observable.empty<PendingMutation>(Scheduler.default);
  }

  abandon(key: Object, target: Version): Observable<void> {
    return Observable.empty<void>(Scheduler.default);
  }

  commit(key: Object, mutation: Object, context: Object, target: Version): Observable<void> {
    return Observable.empty<void>(Scheduler.default);
  }

  fetch(key: Object, version?: Version): Observable<Record> {
    return Observable.just<Record>(null, Scheduler.default);
  }

  push(key: Object, base: string, value: Object, resolves?: Version): Observable<void> {
    return Observable.empty<void>(Scheduler.default);
  }
}
