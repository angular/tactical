/// <reference path="../../../typings/rx/rx.all.d.ts" />

import {Observable, Observer, Subject} from 'rx';
import {Backend, VersionedObject} from './backend';
import {serializeValue} from './json';
import {Stream} from './stream';
import {Record, Store} from './tactical_store';

/**
 * Manages subscriptions to data, and acts as an interface for the application.
 */
export interface DataManager { request(key: Object): Observable<Object>; }

export class TacticalDataManager implements DataManager {
  /**
   * Map of active keys to observables.
   */
  private _stream: {[key: string]: Stream<Object>} = {};

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
    this._store.push(data.key, data.data, data.version).subscribe();
    if (this._stream.hasOwnProperty(keyStr)) {
      this._stream[keyStr].send(data.data);
    }
  }

  /**
   * Request a data object by key.
   *
   * Returns an Observable that will receive updated data for the given key as
   * it becomes available.
   */
  request(key: Object): Observable<Object> {
    var keyStr = serializeValue(key);
    if (!this._stream.hasOwnProperty(keyStr)) {
      this._stream[keyStr] = new Stream<Object>(() => { delete this._stream[keyStr]; });
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
        .filter(data => data != null)
        .map(data => data.value)
        .subscribe(data => {
          if (this._stream.hasOwnProperty(keyStr)) {
            this._stream[keyStr].send(data);
          }
        });
  }
}
