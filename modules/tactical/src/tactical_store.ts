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

import {Observable} from 'rx';

import {Idb, IdbFactory} from './idb';
import {serializeValue} from './json';
import {Record} from './record';
;

/**
 * A wrapper class to handle serializing keys to identify a Chain.
 */
export class ChainKey {
  private _serial: string;

  /**
   * ChainKeys are serialized only at instantiation.
   */
  constructor(private _key: Object) { this._serial = serializeValue(this._key); }

  /**
   * Returns the provided key object.
   */
  get key(): Object { return this._key; }

  /**
   * Returns the serialization of the ChainKey.
   */
  get serial(): string { return this._serial; }
}

/**
 * An explicit Version type to store in Tactical's version store.
 */
export interface Version { version: string; }

/**
 * A wrapper class to handle serializing keys to identify a Record.
 */
export class RecordKey {
  private _serial: string;

  /**
   * RecordKeys are serialized only at instantiation. Does not reserialize the ChainKey.
   */
  constructor(private _version: string, private _key: ChainKey) {
    this._serial = this._version + this._key.serial;
  }

  /**
   * Returns the provided version.
   */
  get version(): string { return this._version; }

  /**
   * Returns the provided ChainKey instance.
   */
  get chain(): ChainKey { return this._key; }

  /**
   * Returns the serialization of the RecordKey.
   */
  get serial(): string { return this._serial; }
}

/**
 * A storage backend.
 */
export interface Store {
  /**
   * Reads a Record from the store.
   *
   * If a version is supplied, returns the object matching that version. Otherwise,
   * returns the most recently committed version of that object.
   */
  fetch(key: Object, version?: string): Observable<Record>;

  /**
   * Stores a Record into the store as the most recent version.
   */
  commit(key: Object, value: Object, version: string): Observable<boolean>;
}

/**
 * An instantiable class of the Tactical Store. Requires an abstraction API over a persistent local
 * cache, and also accepts a store extension to modify the storage location, in that cache, for the
 * instance of the Tactical Store to use.
 */
export class TacticalStore implements Store {
  private static _versionStore: string = "_versions_tactical_";
  private static _recordStore: string = "_records_tactical_";

  private _idb: Idb;

  constructor(idbFactory: IdbFactory, appDB: string = '') {
    this._idb = idbFactory(appDB + '_tactical_db_',
                           [TacticalStore._versionStore, TacticalStore._recordStore]);
  }

  /**
   * Reads a Record from persistent local cache. Emits the Record that
   * matches the provided key and version. If no version is supplied, then this will emit the
   * most recent Record that matches the provided key. If either the key or version are
   * non-matching, this will emit null.
   */
  fetch(key: Object, version?: string): Observable<Record> {
    var recordKey: RecordKey;
    var chainKey: ChainKey = new ChainKey(key);

    if (version) {
      recordKey = new RecordKey(version, chainKey);
      return this._idb.get(TacticalStore._recordStore, recordKey.serial)
          .take(1)
          .map((value: Object) => { return (value) ? {version: version, value: value} : null; });
    } else {
      return this._idb.get(TacticalStore._versionStore, chainKey.serial)
          .take(1)
          .flatMap((ver: Version) => {
            if (ver && ver.version) {
              recordKey = new RecordKey(ver.version, chainKey);
              return this._idb.get(TacticalStore._recordStore, recordKey.serial)
                  .map((value: Object) => {
                    return (value) ? {version: ver.version, value: value} : null;
                  });
            }

            return Observable.just<Record>(null);
          });
    }
  }

  /**
   * Stores a Record into persistent local cache. This will set the most recent version
   * to be the version provided and overwrite the most recent Record, if it is currently unanchored.
   * TODO(ttowncompiled): overwrite unanchored Records.
   */
  commit(key: Object, value: Object, version: string): Observable<boolean> {
    var recordKey: RecordKey = new RecordKey(version, new ChainKey(key));
    return this._idb.put(TacticalStore._recordStore, recordKey.serial, value)
        .take(1)
        .flatMap((ok: boolean) => {
          if (!ok) {
            return Observable.just<boolean>(false);
          }
          var ver: Version = {version: version};
          return this._idb.put(TacticalStore._versionStore, recordKey.chain.serial, ver);
        });
  }
}

/**
 * An implementation of a Store that does nothing.
 */
export class NoopStore implements Store {
  fetch(key: Object, version?: string): Observable<Record> { return Observable.just<Record>(null); }

  commit(key: Object, value: Object, version: string): Observable<boolean> {
    return Observable.just<boolean>(true);
  }
}
