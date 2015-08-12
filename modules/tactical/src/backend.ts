/// <reference path="../../../typings/rx/rx.all.d.ts" />

import {Observable, Subject} from 'rx';
import {serializeValue} from './json';
import {Version} from './tactical_store';

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

  /**
   * If this object is the result of applying
   */
  mutationContext: Object;
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
   * Send a mutation to the backend to be applied. If successful, a new object
   * will be delivered on the data stream with the given opaque context. The
   * mutation may also fail on the server. If the failure is the result of an
   * outdated base version, a new object will be delivered on the data stream.
   * If the server has rejected the mutation for some other reason, a notification
   * will be delivered to the failed mutation stream.
   */
  mutate(key: Object, value: Object, baseVersion: string, context: Object);

  /**
   * A stream of versioned objects coming back from the backend.
   */
  data(): Observable<VersionedObject>;

  /**
   * Mutations which haven't failed because of a version conflict, but the server
   * has chosen to reject them for some other reason.
   */
  failed(): Observable<FailedMutation>
}

/**
 * A mutation failed by the server for a reason other than a version conflict.
 * Contains the id of the failed mutation, plus information about the failure.
 */
export interface FailedMutation {
  key: Object;
  baseVersion: string;
  context: Object;
  reason: string;
  debuggingInfo: Object;
}

/**
 * A fake implementation of the backend, intended for testing.
 */
export class FakeBackend implements Backend {
  dataSubject: Subject<VersionedObject>;
  failedSubject: Subject<FailedMutation>;
  objects: {[key: string]: VersionedObject} = {};

  constructor() {
    this.dataSubject = new Subject<VersionedObject>();
    this.failedSubject = new Subject<FailedMutation>();
  }

  request(key: Object): void {
    var keyStr = serializeValue(key);
    if (!this.objects.hasOwnProperty(keyStr)) {
      return;
    }
    setTimeout(() => { this.dataSubject.onNext(this.objects[keyStr]); });
  }

  /**
   * Load a VersionedObject into the fake backend. It will be returned the next
   * time a request is received for object.key. If broadcast is true, it will
   * also be sent out immediately.
   */
  load(object: VersionedObject, broadcast: boolean = true): void {
    this.objects[serializeValue(object.key)] = object;
    if (broadcast) {
      this.dataSubject.onNext(object);
    }
  }

  mutate(key: Object, value: Object, baseVersion: string, context: Object): void {
    var keyStr = serializeValue(key);
    // Check for version compatibility.
    if (this.objects.hasOwnProperty(keyStr)) {
      var old = this.objects[keyStr];
      if (old.version !== baseVersion) {
        // Newer version is available. Reject mutation by returning new version.
        this.dataSubject.onNext(old);
        return;
      }
    }
    if (context.hasOwnProperty('fail') && context['fail']) {
      this.failedSubject.onNext({
        key: key,
        baseVersion: baseVersion,
        context: context,
        reason: 'Fail for test',
        debuggingInfo: {failure: true}
      });
      return;
    }
    // Construct a new version of the object.
    this.objects[keyStr] = <VersionedObject>{
      key: key,
      version: baseVersion + '.m',
      data: value,
      mutationContext: context
    };
    this.dataSubject.onNext(this.objects[keyStr]);
  }

  /**
   * Stream of versioned objects coming back from the backend.
   */
  data(): Observable<VersionedObject> { return this.dataSubject; }

  failed(): Observable<FailedMutation> { return this.failedSubject; }
}
