/// <reference path="../../../typings/rx/rx.all.d.ts" />

import {Observable, ReplaySubject, Scheduler} from 'rx';

// Factory functions.
//==================================================================================================

/**
 * A Factory type to produce Idb compatible objects. Requires a database name for the Idb
 * implementation to use and a list of stores that the Idb implementation may access.
 */
export type IdbFactory = (database: string, stores: string[]) => Idb;

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

// Idb interfaces.
//==================================================================================================

/**
 * A very minimal interface for a key-value store, designed as an abstraction
 * layer over IndexedDB.
 */
export interface Idb {
  keys(store: string): Observable<string>;
  get(store: string, key: string): Observable<Object>;
  put(store: string, key: string, value: Object): Observable<boolean>;
  remove(store: string, key: string): Observable<boolean>;
  transaction(stores: string[]): Observable<IdbTransaction>;
}

/**
 * An interface for a single Idb transaction that provides a lock on all scoped
 * stores.
 */
export interface IdbTransaction {
  get(store: string, key: string): Observable<Object>;
  put(store: string, key: string, value: Object): Observable<boolean>;
  remove(store: string, key: string): Observable<boolean>;
}

// Idb implementations.
//==================================================================================================

/**
 * An in-memory implementation of the Idb interface, mostly useful for testing.
 */
export class InMemoryIdb implements Idb {
  constructor(public db: Object) {}

  /**
   * Emits all the keys present in the given store.
   */
  keys(store: string): Observable<string> {
    if (!this.db.hasOwnProperty(store)) {
      return Observable.empty<string>();
    }
    return Observable.from<string>(Object.keys(this.db[store]));
  }

  /**
   * Retrieve the object associated with a key from the given store, or return
   * null if the key doesn't exist in that store.
   */
  get(store: string, key: string): Observable<Object> {
    if (!this.db.hasOwnProperty(store)) {
      return Observable.just<Object>(null, Scheduler.currentThread);
    }
    return Observable.just<Object>(this._clone(this.db[store][key]), Scheduler.currentThread);
  }

  /**
   * Store an object by key in the given store.
   */
  put(store: string, key: string, value: Object): Observable<boolean> {
    if (!this.db.hasOwnProperty(store)) {
      return Observable.just<boolean>(false, Scheduler.currentThread);
    }
    this.db[store][key] = this._clone(value);
    return Observable.just<boolean>(true, Scheduler.currentThread);
  }

  /**
   * Remove the given key from the given store.
   */
  remove(store: string, key: string): Observable<boolean> {
    if (!this.db.hasOwnProperty(store) || !this.db[store].hasOwnProperty(key)) {
      return Observable.just<boolean>(false, Scheduler.currentThread);
    }
    delete this.db[store][key];
    return Observable.just<boolean>(true, Scheduler.currentThread);
  }

  /**
   * Returns a single IdbTransaction scoped over the given stores.
   */
  transaction(stores: string[]): Observable<IdbTransaction> {
    return Observable.just<IdbTransaction>(new InMemoryTransaction(this.db),
                                           Scheduler.currentThread);
  }
  
  _clone(value: Object): Object {
    if (value === null || value === undefined) {
      return value;
    }
    var data = JSON.stringify(value);
    return JSON.parse(data);
  }
}

/**
 * An implementation of the IdbTransaction interface for testing.
 */
export class InMemoryTransaction implements IdbTransaction {
  constructor(public db: Object) {}

  /**
   * Retrieve the object associated with a key from the given store, or return
   * null if the key doesn't exist in that store.
   */
  get(store: string, key: string): Observable<Object> {
    if (!this.db.hasOwnProperty(store)) {
      return Observable.just<Object>(null, Scheduler.immediate);
    }
    return Observable.just<Object>(this.db[store][key], Scheduler.immediate);
  }

  /**
   * Store an object by key in the given store.
   */
  put(store: string, key: string, value: Object): Observable<boolean> {
    if (!this.db.hasOwnProperty(store)) {
      return Observable.just<boolean>(false, Scheduler.immediate);
    }
    this.db[store][key] = value;
    return Observable.just<boolean>(true, Scheduler.immediate);
  }

  /**
   * Remove the given key from the given store.
   */
  remove(store: string, key: string): Observable<boolean> {
    if (!this.db.hasOwnProperty(store) || !this.db[store].hasOwnProperty(key)) {
      return Observable.just<boolean>(false, Scheduler.immediate);
    }
    delete this.db[store][key];
    return Observable.just<boolean>(true, Scheduler.immediate);
  }
}

/**
 * An implementation of the Idb interface over IndexedDB. Requires an open connection to indexeddb.
 *
 * TODO(ttowncompiled): Reopen the connection if it closes unexpectedly.
 */
export class IndexedDB implements Idb {
  static READ_WRITE: string = 'readwrite';

  constructor(private _dbConnection: ReplaySubject<IDBDatabase>) {}

  /**
   * Emits all the keys present in the given store.
   */
  keys(store: string): Observable<string> {
    return this._dbConnection.flatMap((idbDatabase: IDBDatabase) => {
      return Observable.create<string>((observer: Rx.Observer<string>) => {
        var transaction: IDBTransaction = idbDatabase.transaction([store]);
        transaction.onerror = (error: ErrorEvent) => { observer.onNext(null); };

        var objectStore: IDBObjectStore = transaction.objectStore(store);
        objectStore.openCursor().onsuccess = (success: Event) => {
          var cursor: IDBCursor = (<any>event.target).result;
          if (cursor) {
            observer.onNext(cursor.key);
            cursor.continue();
          }
        };
      });
    });
  }

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

  /**
   * Returns a single IdbTransaction scoped over the given stores.
   */
  transaction(stores: string[]): Observable<IdbTransaction> {
    return this._dbConnection.flatMap((idbDatabase: IDBDatabase) => {
      return Observable.create<IdbTransaction>((observer: Rx.Observer<IdbTransaction>) => {
        var transaction: IDBTransaction = idbDatabase.transaction(stores, IndexedDB.READ_WRITE);
        transaction.onerror = (error: ErrorEvent) => { observer.onError(error); };
        observer.onNext(new IndexedDBTransaction(transaction));
      });
    });
  }
}

/**
 * An implementation of the IdbTransaction interface for IndexedDB.
 */
export class IndexedDBTransaction implements IdbTransaction {
  constructor(private _transaction: IDBTransaction) {}

  /**
   * Retrieve the object associated with a key from the given store, or return
   * null if the key doesn't exist in that store.
   */
  get(store: string, key: string): Observable<Object> {
    return Observable.create<Object>((observer: Rx.Observer<Object>) => {
      var getRequest: IDBRequest = this._transaction.objectStore(store).get(key);
      getRequest.onsuccess = (success: Event) => { observer.onNext(getRequest.result); };
      getRequest.onerror = (error: ErrorEvent) => { observer.onError(error); };
    });
  }

  /**
   * Store an object by key in the given store.
   */
  put(store: string, key: string, value: Object): Observable<boolean> {
    return Observable.create<boolean>((observer: Rx.Observer<boolean>) => {
      var putRequest: IDBRequest = this._transaction.objectStore(store).put(value, key);
      putRequest.onsuccess = (success: Event) => { observer.onNext(true); };
      putRequest.onerror = (error: ErrorEvent) => { observer.onError(error); };
    });
  }

  /**
   * Remove the given key from the given store.
   */
  remove(store: string, key: string): Observable<boolean> {
    return Observable.create<boolean>((observer: Rx.Observer<boolean>) => {
      var removeRequest: IDBRequest = this._transaction.objectStore(store).delete(key);
      removeRequest.onsuccess = (success: Event) => { observer.onNext(true); };
      removeRequest.onerror = (error: ErrorEvent) => { observer.onError(error); };
    });
  }
}
