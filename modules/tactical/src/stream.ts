/// <reference path="../../../typings/rx/rx.all.d.ts" />

import {Observable, Observer} from 'rx';

/**
 * A `Stream` is a kind of observable `Subject` (though TypeScript
 * doesn't allow actually extending `Subject`). Subscribers immediately
 * receive the latest value from the sequence (if there is one) and
 * receive all future values. It tracks all current subscribers and will
 * alert the source when all subscribers disconnect.
 */
export class Stream<T> {
  /**
   * The Observable produced by this Link.
   */
  observable: Observable<T>;

  /**
   * The Observer subscribed to the Observable (used for sending data).
   */
  observers: Observer<T>[] = [];

  /**
   * Called when a new subscription is established.
   */
  onSubscribe: Function;

  /**
   * Called when all subscribers disconnect from the Observable.
   */
  onDisconnect: Function;

  /**
   * Stored previous value.
   */
  private _previous: T = null;

  /**
   * Whether we've seen the first value (and thus `_previous` is valid).
   */
  private _seenInitialValue: boolean = false;

  /**
   * Whether iteration of the `observers` array is in progress.
   *
   * If `_observersLock` is set to true, then deletion from `observers`
   * might interfere with iteration, and thus should be postponed. This
   * happens by adding the `Observer` to `_disconnectBuffer`. When
   * `_unlockObservers` is called after iteration, it will call
   * `_disconnect` again for each `Observer` to be removed.
   */
  private _observersLock: boolean = false;

  /**
   * An array of `Observer`s that need to be disconnected.
   */
  private _disconnectBuffer: Observer<T>[] = [];


  constructor(onDisconnect?: Function, onSubscribe?: Function) {
    this.observable = Observable.create<T>((observer: Observer<T>) => {
      this.observers.push(observer);
      if (this._seenInitialValue) {
        observer.onNext(this._previous);
      }
      if (this.onSubscribe) {
        this.onSubscribe();
      }
      return () => { this._disconnected(observer); };
    });
    this.onSubscribe = onSubscribe;
    this.onDisconnect = onDisconnect;
  }

  /**
   * Deliver a new value to all observers.
   */
  send(obj: T): void {
    this._observersLock = true;
    this.observers.forEach(obs => obs.onNext(obj));
    this._unlockObservers();
    this._previous = obj;
    this._seenInitialValue = true;
  }

  /**
   * Deliver an error to all observers. This should result in a
   * disconnection.
   */
  sendError(err): void {
    this._observersLock = true;
    this.observers.forEach(obs => obs.onError(err));
    this._unlockObservers();
  }

  /**
   * Deliver a completion notice to all observables. This should result in a
   * disconnection.
   */
  close(): void { this.observers.forEach(obs => obs.onCompleted()); }

  private _disconnected(observer: Observer<T>): void {
    if (this._observersLock) {
      this._disconnectBuffer.push(observer);
      return;
    }
    for (var i = 0; i < this.observers.length; i++) {
      if (this.observers[i] === observer) {
        this.observers.splice(i, 1);
        break;
      }
    }
    if (this.observers.length === 0 && this.onDisconnect) {
      this.onDisconnect();
    }
  }

  private _unlockObservers(): void {
    this._observersLock = false;
    this._disconnectBuffer.forEach(obs => this._disconnected(obs));
    this._disconnectBuffer.length = 0;
  }
}
