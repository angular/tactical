/// <reference path="../../../typings/rx/rx.all.d.ts" />

import {Observable, ReplaySubject, Scheduler} from 'rx';

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
      return Observable.just<Object>(null, Scheduler.currentThread);
    }
    return Observable.just<Object>(this.db[store][key], Scheduler.currentThread);
  }

  /**
   * Store an object by key in the given store.
   */
  put(store: string, key: string, value: Object): Observable<boolean> {
    if (!this.db.hasOwnProperty(store)) {
      return Observable.just<boolean>(false, Scheduler.currentThread);
    }
    this.db[store][key] = value;
    return Observable.just<boolean>(true, Scheduler.currentThread);
  }

  /**
   * Remove the given key from the given store.
   */
  remove(store: string, key: string): Observable<boolean> {
    if (!this.db.hasOwnProperty(store)) {
      return Observable.just<boolean>(false, Scheduler.currentThread);
    }
    if (this.db[store].hasOwnProperty(key)) {
      delete this.db[store][key];
      return Observable.just<boolean>(true, Scheduler.currentThread);
    }
  }
}

/**
 * A Factory type to produce an IndexedDB implementation of Idb. Requires a database name for
 * IndexedDB to use and a list of stores that IndexedDB may access.
 */
export var IndexedDBFactory: IdbFactory = (database: string, stores: string[]): IndexedDB => {
  // set buffer size to 1 so that the observable will only emit the most recent opened connection
  var dbConnection: ReplaySubject<IDBDatabase> = new ReplaySubject<IDBDatabase>(1);
  if (indexedDB) {
    var DBOpenRequest: IDBOpenDBRequest = indexedDB.open(database);
    DBOpenRequest.onupgradeneeded = (upgrade: IDBVersionChangeEvent) => {
      stores.forEach((store: string) => { DBOpenRequest.result.createObjectStore(store); });
    };
    DBOpenRequest.onsuccess = (success: Event) => { dbConnection.onNext(DBOpenRequest.result); };
    DBOpenRequest.onerror = (error: ErrorEvent) => { dbConnection.onError(error.message); };
  } else {
    dbConnection.onError('indexedDB is undefined');
  }

  return new IndexedDB(dbConnection);
};

/**
 * An implementation of the Idb interface over IndexedDB. Requires an open connection to indexeddb.
 *
 * TODO(ttowncompiled): Reopen the connection if it closes unexpectedly.
 */
export class IndexedDB implements Idb {
  static READ_WRITE: string = 'readwrite';

  constructor(private _dbConnection: ReplaySubject<IDBDatabase>) {}

  /**
   * Retrieve the object associated with a key from the given store, or return
   * null if the key doesn't exist in that store.
   */
  get(store: string, key: string): Observable<Object> {
    return this._dbConnection.flatMap((idbDatabase: IDBDatabase) => {
      return Observable.create<Object>((observer: Rx.Observer<Object>) => {
        var transaction: IDBTransaction = idbDatabase.transaction([store]);
        transaction.onerror = (error: ErrorEvent) => { observer.onNext(null); };

        var objectStore: IDBObjectStore = transaction.objectStore(store);
        var getRequest: IDBRequest = objectStore.get(key);
        getRequest.onsuccess = (success: Event) => { observer.onNext(getRequest.result); };
        getRequest.onerror = (error: ErrorEvent) => { observer.onNext(null); };
      });
    });
  }

  /**
   * Store an object by key in the given store.
   */
  put(store: string, key: string, value: Object): Observable<boolean> {
    return this._dbConnection.flatMap((idbDatabase: IDBDatabase) => {
      return Observable.create<boolean>((observer: Rx.Observer<boolean>) => {
        var transaction: IDBTransaction = idbDatabase.transaction([store], IndexedDB.READ_WRITE);
        transaction.onerror = (error: ErrorEvent) => { observer.onNext(false); };

        var objectStore: IDBObjectStore = transaction.objectStore(store);
        var putRequest: IDBRequest = objectStore.put(value, key);
        putRequest.onsuccess = (success: Event) => { observer.onNext(true); };
        putRequest.onerror = (error: ErrorEvent) => { observer.onNext(false); };
      });
    });
  }

  /**
   * Remove the given key from the given store.
   */
  remove(store: string, key: string): Observable<boolean> {
    return this._dbConnection.flatMap((idbDatabase: IDBDatabase) => {
      return Observable.create<boolean>((observer: Rx.Observer<boolean>) => {
        var transaction: IDBTransaction = idbDatabase.transaction([store], IndexedDB.READ_WRITE);
        transaction.onerror = (error: ErrorEvent) => { observer.onNext(false); };

        var objectStore: IDBObjectStore = transaction.objectStore(store);
        var removeRequest: IDBRequest = objectStore.delete(key);
        removeRequest.onsuccess = (success: Event) => { observer.onNext(true); };
        removeRequest.onerror = (error: ErrorEvent) => { observer.onNext(false); };
      });
    });
  }
}
