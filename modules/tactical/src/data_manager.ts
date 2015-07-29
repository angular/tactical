/// <reference path="../../../typings/rx/rx.all.d.ts" />

import {Observable, Observer, Subject} from 'rx';
import {Backend, VersionedObject} from './backend';
import {serializeValue} from './json';
import {Stream} from './stream';
import {Record, Store, Version} from './tactical_store';

/**
 * Manages subscriptions to data, and acts as an interface for the application.
 */
export interface DataManager {
  /**
   * Request a particular key for read-only purposes.
   */
  request(key: Object): Observable<Object>;

  /**
   * Request to update a particular key. This will return at least one Updater,
   * an object which references a specific version of the object. The consumer
   * can then change this object and request for the changes to be committed.
   */
  beginUpdate(Key: Object): Observable<Updater>;
}

/**
 * Provides a mechanism for updating a particular data object.
 */
export interface Updater {
  value: Object;
  commit(): Observable<boolean>;
}

export class TacticalDataManager implements DataManager {
  /**
   * Map of active keys to observables.
   */
  private _stream: {[key: string]: Stream<Record>} = {};

  /**
   * Map of active updates.
   */
  private _updates: {[key: string]: Observer<Updater>[]} = {};

  /**
   * Create an instance of `TacticalDataManager`, backed by the given
   * `Backend` and using the given `Store` for local operation.
   */
  constructor(private _backend: Backend, private _store: Store) {
    this._backend.data().subscribe((data: VersionedObject) => { this._backendData(data); });
  }

  /**
   * Called when data arrives from the backend.
   */
  private _backendData(data: VersionedObject): void {
    var keyStr = serializeValue(data.key);
    this._store.push(data.key, data.version, data.data).subscribe();
    this._pushUpdate(keyStr, new Record(new Version(data.version), data.data));
  }

  /**
   * Request a data object by key.
   *
   * Returns an Observable that will receive updated data for the given key as
   * it becomes available.
   */
  request(key: Object): Observable<Object> {
    var keyStr = serializeValue(key);
    return this._open(key, keyStr).map((rec: Record) => { return rec.value; });
  }

  commit(key: Object, value: Object, baseVersion: Version): Observable<boolean> {
    return this._store.commit(key, baseVersion, value, {}).defaultIfEmpty().map(() => true);
  }

  _open(key: Object, keyStr: string): Observable<Record> {
    if (!this._stream.hasOwnProperty(keyStr)) {
      this._stream[keyStr] = new Stream<Record>(() => { delete this._stream[keyStr]; });
      this._backend.request(key);
      this._requestFromStore(key);
    }
    return this._stream[keyStr].observable;
  }

  /**
   * Make a request from the local store for the given key.
   */
  private _requestFromStore(key: Object): void {
    var keyStr = serializeValue(key);
    this._store.fetch(key)
        .filter(record => record != null)
        .subscribe((record: Record) => { this._pushUpdate(keyStr, record); });
  }

  private _pushUpdate(keyStr: string, record: Record) {
    if (this._stream.hasOwnProperty(keyStr)) {
      this._stream[keyStr].send(record);
    }
  }

  beginUpdate(key: Object): Observable<Updater> {
    var keyStr = serializeValue(key);
    return this._open(key, keyStr)
        .map((record: Record):
             Updater => { return new TacticalUpdater(record.value, key, this, record.version); });
  }
}

class TacticalUpdater implements Updater {
  _valid: boolean = true;

  constructor(public value: Object, private _key: Object, private _dm: TacticalDataManager,
              private _version: Version) {}

  commit(): Observable<boolean> { return this._dm.commit(this._key, this.value, this._version); }
}
