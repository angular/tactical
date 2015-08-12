/// <reference path="../../../typings/rx/rx.d.ts" />
/// <reference path="../../../typings/socket.io/socket.io.d.ts" />
import {Observable, Subject} from 'rx';
import {Backend, FailedMutation, VersionedObject} from './backend';
import {Version} from './tactical_store';

// Backend service interfaces
//==================================================================================================


/** A callback to handle resolving a mutation. */
export type AcceptHandler = (version: string, data: Object) => void;

/** A callback to handle failing a mutation. */
export type RejectHandler = (rejection: Conflict | Failure) => void;

/** A callback which indicates request processing is over (possibly with an error) */
export type Callback = (err?: any) => void;

export type PublishHandler = (key: Object, version: string, data: Object) => void;

export class Conflict {
  version: string;
  data: Object;
}

export class Failure {
  constructor(public reason: string, public info: Object = {}) {}
}

export interface MutationHandler {
  accept: AcceptHandler;
  reject: RejectHandler;
  publish: PublishHandler;
}

/**
 * An interface that a backend must implement and provide to Tactical's implementation of
 * SocketServer.
 */
export interface BackendService {
  /**
   * Called when a request is received from the client. The `key` provided by the application
   * identifies the request. The backend is free to `publish` multiple responses for many different
   * keys.
   *
   *
   */
  onRequest(key: Object, publish: PublishHandler, callback: Callback): void;

  /**
   * Called when a mutation for the given `key` is received from the client. This mutation is based
   * on
   * the version `base` and instructs the backend to set `key` to `value`.
   *
   * The backend is given a `handler` with a few different methods that can be called. If the
   * backend decides to accept the mutation, it should call `handler.accept` with the new version
   * and the mutated value. If the backend cannot accept the mutation, it should call
   * `handler.reject`,
   * the argument to which depends on the reason for rejection. Backends can reject for two reasons.
   * Either the mutation is against an outdated version, or the new object fails some validation
   * rule.
   *
   * If there is a newer version of the object in question, `handler.reject` should be called with a
   * `Conflict` object, which can be created from the version and value of the conflicting object.
   * Otherwise, it should be called with a `Failure` which takes an error message and an arbitrary
   * object that will be passed to the client for debugging purposes.
   *
   * `handler.publish` is available if the backend wishes to deliver updates to other keys that
   * happen
   * as a result of the mutation.
   *
   * `callback` should be called when the mutation has been handled, or earlier with any
   * error that might occur.
   */
  onMutation(key: Object, base: string, value: Object, handler: MutationHandler,
             callback: Callback): void;
}

// Types emitted on socket streams
//==================================================================================================

/**
 * The type that is emitted on the 'data' stream from server to client.
 */
export type DataFrame = VersionedObject;

/**
 * The type that is emitted on the 'failure' stream from server to client.
 */
export type FailureFrame = FailedMutation;

/**
 * The type that is emitted on the 'request' stream from client to server.
 */
export interface RequestFrame {
  key: Object;       // the 'key' that is associated with the request
  context?: Object;  // contextual information needed to authorize the request
}

/**
 * The type that is emitted on the 'mutation' stream from client to server.
 */
export interface MutationFrame {
  key: Object;      // the 'key' that is associated with the 'mutation'
  base: string;     // the 'base' that the 'mutation' is targeting
  data: Object;     // the 'mutation' that is to be applied
  context: Object;  // contextual information needed to authorize the request
}

// Socket IO implementations
//==================================================================================================

/**
 * A socket.io implementation of the SocketClient interface.
 */
export class SocketIOClient implements Backend {
  private _data: Subject<DataFrame> = new Subject<DataFrame>();
  private _failures: Subject<FailureFrame> = new Subject<FailureFrame>();

  /** Requires a socket.io socket to connect with. */
  constructor(public socket: SocketIO.Socket) { this._listen(); }

  data(): Observable<DataFrame> { return this._data; }

  failed(): Observable<FailureFrame> { return this._failures; }

  mutate(key: Object, mutation: Object, base: string, context: Object): void {
    var frame: MutationFrame = {key: key, base: base, data: mutation, context: context};
    this.socket.emit('mutation', frame);
  }

  request(key: Object, cntxt?: Object): void {
    var frame: RequestFrame = {key: key, context: (cntxt) ? cntxt : {}};
    this.socket.emit('request', frame);
  }

  /**
   * Establishes listeners on the incoming client streams.
   */
  private _listen(): void {
    this.socket.on('data', (frame: DataFrame) => this._data.onNext(frame));
    this.socket.on('failure', (frame: FailureFrame) => this._failures.onNext(frame));
  }
}

/**
 * A server that connects a `SocketIOClient` instance on the client to a `BackendService`
 */
export class SocketIOServer {
  constructor(public service: BackendService, public io: SocketIO.Server) {}

  /**
   * Send data to all connected clients.
   */
  broadcastData(key: Object, base: string, data: Object): void {
    var dataFrame: DataFrame = {key: key, version: base, data: data, mutationContext: null};
    this.io.emit('data', dataFrame);
  }

  /**
   * Take over an incoming socket connection.
   */
  public accept(socket: SocketIO.Socket): void {
    // Shared function for publishing data.
    var publish: PublishHandler = (key: Object, version: string, data: Object): void => {
      var dataFrame: DataFrame = {key: key, version: version, data: data, mutationContext: {}};
      socket.emit('data', dataFrame);
    };
    socket.on('request', (frame: RequestFrame) => {
      this.service.onRequest(frame.key, publish, (err: any) => {
        // TODO(alxhub): better error handling.
        if (err) throw err;
      });
    });
    socket.on('mutation', (frame: MutationFrame) => {
      var handler: MutationHandler = {
        accept: (version: string, data: Object) => {
          socket.emit('data', <DataFrame>{
            key: frame.key,
            version: version,
            data: data,
            mutationContext: frame.context
          });
        },
        reject: (rejection: Conflict | Failure) => {
          if (rejection instanceof Conflict) {
            // Rejection due to conflict is just a new data notification without the context.
            socket.emit(
                'data',
                <DataFrame>{key: frame.key, version: rejection.version, data: rejection.data});
          } else if (rejection instanceof Failure) {
            // Send a failure notification.
            socket.emit('failure', <FailureFrame>{
              key: frame.key,
              reason: rejection.reason,
              debuggingInfo: rejection.info
            });
          }
        },
        publish: publish
      };
      this.service.onMutation(frame.key, frame.base, frame.data, handler, (err: any) => {
        // TODO(alxhub): better error handling.
        if (err) throw err;
      });
    });
  }
}
