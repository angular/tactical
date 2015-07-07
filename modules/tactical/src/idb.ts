/// <reference path="../../../typings/rx/rx.all.d.ts" />

import {Observable, ReplaySubject} from 'rx';

/**
 * A Factory type to produce Idb compatible objects. Requires a database name for the Idb
 * implementation to use and a list of stores that the Idb implementation may access.
 */
export type IdbFactory = (database: string, stores: string[]) => Idb;

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
 * A Factory to produce an InMemoryIdb implementation of Idb. Requires a database name for
 * InMemoryIdb to use and a list of stores that InMemoryIdb may access.
 */
export var InMemoryIdbFactory: IdbFactory = (database: string, stores: string[]): InMemoryIdb => {
  var db: Object = {};
  stores.forEach((store: string) => { db[store] = {}; });
  return new InMemoryIdb(db);
};

/**
 * An in-memory implementation of the Idb interface, mostly useful for testing.
 */
export class InMemoryIdb implements Idb {
  constructor(public db: Object) {}

  /**
   * Retrieve the object associated with a key from the given store, or return
   * null if the key doesn't exist in that store.
   */
  get(store: string, key: string): Observable<Object> {
    if (!this.db.hasOwnProperty(store)) {
      return Observable.from([null]);
    }
    return Observable.from([this.db[store][key]]);
  }

  /**
   * Store an object by key in the given store.
   */
  put(store: string, key: string, value: Object): Observable<boolean> {
    if (!this.db.hasOwnProperty(store)) {
      return Observable.from([false]);
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

/**
 * A Factory type to produce an IndexedDB implementation of Idb. Requires a database name for
 * IndexedDB to use and a list of stores that IndexedDB may access.
 */
export var IndexedDBFactory: IdbFactory = (database: string, stores: string[]): IndexedDB => {
  // set buffer size to 1 so that the observable will only emit the most recent opened connection
  var dbConnection: ReplaySubject<any> = new ReplaySubject<any>(1);
  if (indexedDB) {
    var DBOpenRequest = indexedDB.open(database);
    DBOpenRequest.onupgradeneeded = (upgrade: any) => {
      stores.forEach((store: string) => { upgrade.target.result.createObjectStore(store); });
    };
    DBOpenRequest.onsuccess = (success: any) => { dbConnection.onNext(success.target.result); };
    DBOpenRequest.onerror = (error: any) => { dbConnection.onError(error); };
  } else {
    dbConnection.onError('indexedDB is undefined');
  }

  return new IndexedDB(dbConnection);
};

/**
 * An implementation of the Idb interface over IndexedDB. Requires an open connection to indexeddb.
 *
 * TODO(ttowncompiled): Reopen the connection if it closes unexpectedly.
 * TODO(ttowncompiled): Definitions file for indexedDB would be nice.
 */
export class IndexedDB implements Idb {
  static READ_WRITE: string = 'readwrite';

  constructor(private _dbConnection: ReplaySubject<any>) {}

  /**
   * Retrieve the object associated with a key from the given store, or return
   * null if the key doesn't exist in that store.
   */
  get(store: string, key: string): Observable<Object> {
    return this._dbConnection.flatMap((idbDatabase: any) => {
      return Observable.create<Object>((observer: Rx.Observer<Object>) => {
        var transaction = idbDatabase.transaction([store]);
        transaction.onerror = (error: any) => { observer.onNext(null); };

        var objectStore = transaction.objectStore(store);
        var getRequest = objectStore.get(key);
        getRequest.onsuccess = (success: any) => { observer.onNext(success.target.result); };
        getRequest.onerror = (error: any) => { observer.onNext(null); };
      });
    });
  }

  /**
   * Store an object by key in the given store.
   */
  put(store: string, key: string, value: Object): Observable<boolean> {
    return this._dbConnection.flatMap((idbDatabase: any) => {
      return Observable.create<boolean>((observer: Rx.Observer<boolean>) => {
        var transaction = idbDatabase.transaction([store], IndexedDB.READ_WRITE);
        transaction.onerror = (error: any) => { observer.onNext(false); };

        var objectStore = transaction.objectStore(store);
        var putRequest = objectStore.put(value, key);
        putRequest.onsuccess = (success: any) => { observer.onNext(true); };
        putRequest.onerror = (error: any) => { observer.onNext(false); };
      });
    });
  }

  /**
   * Remove the given key from the given store.
   */
  remove(store: string, key: string): Observable<boolean> {
    return this._dbConnection.flatMap((idbDatabase: any) => {
      return Observable.create<boolean>((observer: Rx.Observer<boolean>) => {
        var transaction = idbDatabase.transaction([store], IndexedDB.READ_WRITE);
        transaction.onerror = (error: any) => { observer.onNext(false); };

        var objectStore = transaction.objectStore(store);
        var removeRequest = objectStore.remove(key);
        removeRequest.onsuccess = (success: any) => { observer.onNext(true); };
        removeRequest.onerror = (error: any) => { observer.onNext(false); };
      });
    });
  }
}
