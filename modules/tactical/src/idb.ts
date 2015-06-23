/// <reference path="../../../typings/rx/rx.d.ts" />
/// <reference path="../../../typings/rx/rx-lite.d.ts" />


import {Observable} from 'rx';

/**
 * A very minimal interface for a key-value store, designed as an abstraction
 * layer over IndexedDB.
 */
export interface Idb {
  get(store: string, key: string): Observable<Object>;
  put(store: string, key: string, value: Object): Observable<boolean>;
  remove(store: string, key: string): Observable<boolean>;
}

/**
 * An in-memory implementation of the Idb interface, mostly useful for testing.
 */
export class InMemoryIdb implements Idb {
  db: Object = {};

  /**
   * Retrieve the object associated with a key from the given store, or return
   * undefined if the key doesn't exist in that store.
   */
  get(store: string, key: string): Observable<Object> {
    if (!this.db.hasOwnProperty(store)) {
      return Observable.from([undefined]);
    }
    return Observable.from([this.db[store][key]]);
  }

  /**
   * Store an object by key in the given store.
   */
  put(store: string, key: string, value: Object): Observable<boolean> {
    if (!this.db.hasOwnProperty(store)) {
      this.db[store] = {};
    }
    this.db[store][key] = value;
    return Observable.from([true]);
  }

  /**
   * Remove the given key from the given store.
   */
  remove(store: string, key: string): Observable<boolean> {
    if (!this.db.hasOwnProperty(store)) {
      return Observable.from([false]);
    }
    if (this.db[store].hasOwnProperty(key)) {
      delete this.db[store][key];
      return Observable.from([true]);
    }
  }
}
