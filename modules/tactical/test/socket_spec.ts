/// <reference path="../../../typings/chai/chai.d.ts" />
/// <reference path="../../../typings/mocha/mocha.d.ts" />
/// <reference path="../../../typings/socket.io/socket.io.d.ts" />
import {expect} from 'chai';
import {
  DataFrame,
  FailureFrame,
  MutationFrame,
  RequestFrame,
  SocketIOClient,
  SocketIOServer
} from '../src/socket';

var Server = require('socket.io');
var Socket = require('socket.io-client');

var server: SocketIO.Server = new Server(8080);
var connHandler: Function = (socket: SocketIO.Socket): void => {};
server.on('connection', (socket: SocketIO.Socket) => connHandler(socket));

var options = {transports: ['websocket'], 'force new connection': true};

var key: Object = {key: true};
var cntxt: Object = {auth: true};

describe('SocketIOClient', () => {
  it("request should send a request frame to the server", (done) => {
    var ioSocket: SocketIO.Socket = Socket.connect('http://localhost:8080', options);
    var client: SocketIOClient = new SocketIOClient(ioSocket);

    connHandler = (socket: SocketIO.Socket) => {
      socket.on('request', (frame: RequestFrame) => {
        expect(frame.key).to.deep.equal(key);
        expect(frame.context).to.deep.equal(cntxt);
        socket.disconnect(true);
        done();
      });
    };

    client.request(key, cntxt);
  });

  it("mutate should send a mutation frame to the server", (done) => {
    var ioSocket: SocketIO.Socket = Socket.connect('http://localhost:8080', options);
    var client: SocketIOClient = new SocketIOClient(ioSocket);

    var base: string = 'foobase';
    var id: number = 1;
    var mutation: Object = {foo: 'baz'};

    connHandler = (socket: SocketIO.Socket) => {
      socket.on('mutation', (frame: MutationFrame) => {
        expect(frame.key).to.deep.equal(key);
        expect(frame.base).to.equal(base);
        expect(frame.id).to.equal(id);
        expect(frame.context).to.deep.equal(cntxt);
        socket.disconnect(true);
        done();
      });
    };

    client.mutate(key, mutation, base, id, cntxt);
  });

  it("data should emit incoming data frames from the server", (done) => {
    var ioSocket: SocketIO.Socket = Socket.connect('http://localhost:8080', options);
    var client: SocketIOClient = new SocketIOClient(ioSocket);

    var version: string = 'foobase';
    var data: Object = {foo: 'foo'};
    var mutationId: Object = {id: '0'};

    client.data().subscribeOnNext((frame: DataFrame) => {
      expect(frame.version).to.equal(version);
      expect(frame.key).to.deep.equal(key);
      expect(frame.data).to.deep.equal(data);
      expect(frame.mutationId).to.deep.equal(mutationId);
      ioSocket.disconnect(true);
      done();
    });

    connHandler = (socket: SocketIO.Socket) => {
      var frame: DataFrame = {version: version, key: key, data: data, mutationId: mutationId};
      socket.emit('data', frame);
    };
  });

  it("failed should emit incoming failure frames from the server", (done) => {
    var ioSocket: SocketIO.Socket = Socket.connect('http://localhost:8080', options);
    var client: SocketIOClient = new SocketIOClient(ioSocket);

    var baseVersion: string = 'foobase';
    var mutationId: Object = {id: '0'};
    var reason: string = 'cause';
    var debuggingInfo: Object = {mutation: 'should fail'};

    client.failed().subscribeOnNext((frame: FailureFrame) => {
      expect(frame.key).to.deep.equal(key);
      expect(frame.baseVersion).to.equal(baseVersion);
      expect(mutationId).to.deep.equal(mutationId);
      expect(reason).to.equal(reason);
      expect(debuggingInfo).to.deep.equal(debuggingInfo);
      ioSocket.disconnect(true);
      done();
    });

    connHandler = (socket: SocketIO.Socket) => {
      var frame: FailureFrame = {
        key: key,
        baseVersion: baseVersion,
        mutationId: mutationId,
        reason: reason,
        debuggingInfo: debuggingInfo
      };
      socket.emit('failure', frame);
    };
  });
});

describe('SocketIOServer', () => {
  it("broadcast should send a data frame to all connected clients", (done) => {
    var clientA: SocketIO.Socket = Socket.connect('http://localhost:8080', options);
    var clientB: SocketIO.Socket = Socket.connect('http://localhost:8080', options);
    var socketServer: SocketIOServer = new SocketIOServer(null, server);
    var clients: number = 0;

    var version: string = 'foobase';
    var data: Object = {foo: 'foo'};
    var mutationId: Object = {id: -1};

    var dataHandler: Function = (frame: DataFrame) => {
      expect(frame.version).to.equal(version);
      expect(frame.key).to.deep.equal(key);
      expect(frame.data).to.deep.equal(data);
      expect(frame.mutationId).to.deep.equal(mutationId);
      if (--clients == 0) {
        clientA.disconnect(true);
        clientB.disconnect(true);
        done();
      }
    };

    clientA.on('data', dataHandler);
    clientB.on('data', dataHandler);

    connHandler = (socket: SocketIO.Socket) => {
      if (++clients == 2) {
        socketServer.broadcastData(key, version, data);
      }
    };
  });
});