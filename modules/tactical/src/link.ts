/// <reference path="../../../typings/rx/rx.all.d.ts" />

import {Observable, Observer} from 'rx';

/**
 * A Link acts as a source for a hot Observable, and can be used to deliver
 * data to it. It also keeps track of subscriptions and can provide a
 * notification when the Observable is no longer being listened to, allowing
 * for cleanup of whatever data source is feeding the Link.
 */
export class Link<T> {
  /**
   * The Observable produced by this Link.
   */
  observable: Observable<T>;

  /**
   * The Observer subscribed to the Observable (used for sending data).
   */
  observer: Observer<T>;

  /**
   * Called when all subscribers disconnect from the Observable.
   */
  onDisconnect: Function = () => {}

  constructor() {
    this.observable = Observable.create<T>((observer: Observer<T>) => {
      this.observer = observer;
      return () => { this.onDisconnect(); };
    });
  }

  /**
   * Deliver a new value to all observers.
   */
  send(obj: T): void { this.observer.onNext(obj); }

  /**
   * Deliver an error to all observers. This should result in a
   * disconnection.
   */
  sendError(err): void { this.observer.onError(err); }

  /**
   * Deliver a completion notice to all observables. This should result in a
   * disconnection.
   */
  close(): void { this.observer.onCompleted(); }
}
