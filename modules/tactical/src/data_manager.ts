/// <reference path="../../../typings/rx/rx.d.ts" />
/// <reference path="../../../typings/rx/rx-lite.d.ts" />

import {Observable, Subject} from 'rx';
import {Backend, VersionedObject} from './backend';
import {serializeValue} from './json';
import {Link} from './link';
import {Store} from './tactical_store';
import {Record} from './record';

/**
 * Manages subscriptions to data, and acts as an interface for the application.
 */
export interface DataManager { request(key: Object): Observable<Object>; }

export class TacticalDataManager implements DataManager {
  /**
   * Connection to the application backend.
   */
  private _backend: Backend;

  /**
   * Local store.
   */
  private _store: Store;

  /**
   * Map of active keys to observables.
   */
  private _active: {[key: string]: Link<Object>[]} = {};

  constructor(backend: Backend, store: Store) {
    this._backend = backend;
    this._store = store;
    backend.data().subscribe((data: VersionedObject) => { this._backendData(data); });
  }

  /**
   * Called when data arrives from the backend.
   */
  private _backendData(data: VersionedObject): void {
    var keyStr = serializeValue(data.key);
    this._store.commit(data.key, data.data, data.version).subscribe();
    if (this._active.hasOwnProperty(keyStr)) {
      this._active[keyStr].forEach((link: Link<Object>) => { link.send(data.data); });
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
    var link = new Link<Object>();
    if (!this._active.hasOwnProperty(keyStr)) {
      this._active[keyStr] = new Array<Link<Object>>();
    }
    this._backend.request(key);
    this._requestFromStore(key, link);
    this._active[keyStr].push(link);
    return link.observable;
  }

  /**
   * Make a request from the local store for the given key.
   */
  private _requestFromStore(key: Object, link: Link<Object>): void {
    this._store.fetch(key).subscribe((data: Record) => {
      if (data != null) {
        link.send(data.value);
      }
    });
  }
}
