/// <reference path="../../../typings/rx/rx.d.ts" />
/// <reference path="../../../typings/rx/rx-lite.d.ts" />

import {Observable, Subject} from 'rx';
import {serializeValue} from './json';

/**
 * A combination of version, key, and data returned by the backend.
 */
export interface VersionedObject {
  /**
   * Version of this object.
   */
  version: string;

  /**
   * Key used to retrieve this object from the backend.
   */
  key: Object;

  /**
   * Data object itself.
   */
  data: Object;
}

/**
 * A bidirectional interface to the backend, exposing a request path for making
 * data requests and a stream of objects coming back.
 */
export interface Backend {
  /**
   * Send a request for data to the backend. Usually this will result in a data
   * object for the given key being returned on the data stream.
   */
  request(key: Object): void;

  /**
   * A stream of versioned objects coming back from the backend.
   */
  data(): Observable<VersionedObject>;
}

/**
 * A fake implementation of the backend, intended for testing.
 */
export class FakeBackend implements Backend {
  subject: Subject<VersionedObject>;
  objects: {[key: string]: VersionedObject} = {};

  constructor() { this.subject = new Subject<VersionedObject>(); }

  request(key: Object): void {
    var keyStr = serializeValue(key);
    if (!this.objects.hasOwnProperty(keyStr)) {
      return;
    }
    setTimeout(() => { this.subject.onNext(this.objects[keyStr]); });
  }

  /**
   * Load a VersionedObject into the fake backend. It will be returned the next
   * time a request is received for object.key. If broadcast is true, it will
   * also be sent out immediately.
   */
  load(object: VersionedObject, broadcast: boolean = true): void {
    this.objects[serializeValue(object.key)] = object;
    if (broadcast) {
      this.subject.onNext(object);
    }
  }

  /**
   * Stream of versioned objects coming back from the backend.
   */
  data(): Observable<VersionedObject> { return this.subject; }
}
