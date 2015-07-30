/// <reference path="../../../typings/tsd.d.ts" />
import {Observable, Subject} from 'rx';
import {Backend, FailedMutation, VersionedObject} from './backend';
import {Version} from './tactical_store';

// Backend service interfaces
//==================================================================================================

/** A callback to handle failing a mutation. */
export type FailureHandler = (err: any, result: Failure) => void;

/** A callback to handle resolving a mutation. */
export type ResolutionHandler = (err: any, result: BaseData) => void;

/** A callback to handle satisfying a request. */
export type ResponseHandler = (err: any, result: BaseData) => void;

/**
 * An interface that a backend must implement and provide to Tactical's implementation of
 * SocketServer.
 */
export interface BackendService {
  /**
   * Called by SocketServer when a mutation is received from the client. The 'key' was provided by
   * the application to identify the 'mutation', the 'base' was provided by the backend services
   * to identify the data associated with the 'key', the 'id' was provided by Tactical to identify
   * the 'mutation', and the 'mutation' was provided by the application to be applied to the backend
   * data model.
   *
   * 'resolve' should be called if the 'mutation' can be successfully applied to the data model. A
   * mutation can only be considered successful if the resulting change to the data model is deeply
   * equal to the provided 'mutation'. This will notify all connected clients that a new mutation
   * has been resolved by the backend services.
   *
   * 'fail' should be called if the 'mutation' cannot be applied or if the resulting change of
   * applying the 'mutation' does not deeply equal the 'mutation' provided. This will notify
   * the calling client that their mutation could not be applied.
   */
  onMutation(key: Object, base: string, id: number, mutation: Object, resolve: ResolutionHandler,
             fail: FailureHandler): void;

  /**
   * Called by SocketServer when a request is received from the client. The 'key' was provided
   * by the application to identify the request.
   *
   * 'respond' should be called once the request has been satisfied by the backend services.
   * This will notify the calling client that their request has been satisfied.
   */
  onRequest(key: Object, respond: ResponseHandler): void;
}

/**
 * A callback result type for ResolutionHandler and ResponseHandler.
 */
export interface BaseData {
  base: string;  // a unique 'base' version provided by the backend service to identify the 'data'
  data: Object;  // the 'data' to send upstream to the client
}

/**
 * A callback result type for FailureHandler.
 */
export interface Failure {
  reason: string;    // a short description of why the mutation was failed
  context?: Object;  // any 'contextual' data surrounding the 'reason' why the mutation was failed
}

// Types emitted on socket streams
//==================================================================================================

/**
 * The type that is emitted on the 'data' stream.
 */
export type DataFrame = VersionedObject;

/**
 * The type that is emitted on the 'failure' stream.
 */
export type FailureFrame = FailedMutation;

/**
 * The type that is emitted on the 'mutation' stream.
 */
export interface MutationFrame {
  key: Object;       // the 'key' that is associated with the 'mutation'
  base: string;      // the 'base' that the 'mutation' is targeting
  id: number;        // the unique 'id' of the 'mutation'
  mutation: Object;  // the 'mutation' that is to be applied
  context?: Object;  // contextual information needed to authorize the request
}

/**
 * The type that is emitted on the 'request' stream.
 */
export interface RequestFrame {
  key: Object;       // the 'key' that is associated with the request
  context?: Object;  // contextual information needed to authorize the request
}

// Socket interfaces
//==================================================================================================

/**
 * A bidirectional interface to the client that rests on the server. Uses an implementation of
 * BackendService to supply requests to the backend and stream the results to respective clients.
 */
export interface SocketServer {
  /**
   * Broadcasts a data type to each connected client on their respective 'data' stream.
   */
  broadcastData(key: Object, base: string, data: Object): void;
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

  mutate(key: Object, mutation: Object, base: string, id: number, cntxt?: Object): void {
    var mutationFrame: MutationFrame =
        {key: key, base: base, id: id, mutation: mutation, context: (cntxt) ? cntxt : {}};
    Observable.just<MutationFrame>(mutationFrame)
        .map((frame: MutationFrame) => { this.socket.emit('mutation', frame); })
        .subscribe();
  }

  request(key: Object, cntxt?: Object): void {
    var requestFrame: RequestFrame = {key: key, context: (cntxt) ? cntxt : {}};
    Observable.just<RequestFrame>(requestFrame)
        .map((frame: RequestFrame) => { this.socket.emit('request', frame); })
        .subscribe();
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
 * A socket.io implementation of the SocketServer interface.
 */
export class SocketIOServer implements SocketServer {
  /**
   * Requires a BackendService to pair with and an implementation of a socket.io server to
   * connect with.
   */
  constructor(public service: BackendService, public io: SocketIO.Server) { this._listen(); }

  broadcastData(key: Object, base: string, data: Object): void {
    var dataFrame: DataFrame = {key: key, version: base, data: data, mutationId: {id: -1}};
    this.io.emit('data', dataFrame);
  }

  /**
   * Establishes listeners on the incoming server streams.
   */
  private _listen(): void {
    this.io.on('connection', (socket: SocketIO.Socket) => {
      socket.on('request', (frame: RequestFrame) => {
        var respond: ResponseHandler = (err: any, result: BaseData): void => {
          var dataFrame: DataFrame =
              {key: frame.key, version: result.base, data: result.data, mutationId: {id: -1}};
          socket.emit('data', dataFrame);
        };
        this.service.onRequest(frame.key, respond);
      });
      socket.on('mutation', (frame: MutationFrame) => {
        var resolve: ResolutionHandler = (err: any, result: BaseData): void => {
          var dataFrame: DataFrame =
              {key: frame.key, version: result.base, data: result.data, mutationId: {id: frame.id}};
          this.io.emit('data', dataFrame);
        };
        var fail: FailureHandler = (err: any, result: Failure): void => {
          var failureFrame: FailureFrame = {
            key: frame.key,
            baseVersion: frame.base,
            mutationId: {id: frame.id},
            reason: result.reason,
            debuggingInfo: (result.context) ? result.context : {}
          };
          socket.emit('failure', failureFrame);
        };
        this.service.onMutation(frame.key, frame.base, frame.id, frame.mutation, resolve, fail);
      });
    });
  }
}