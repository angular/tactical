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

var options = {transports: ['websocket'], 'force new connection': true};

var key: Object = {key: true};
var context: Object = {auth: true};

describe('SocketIOClient', () => {
  var server: SocketIO.Server;
  var connHandler: Function = (socket: SocketIO.Socket): void => {};
  before(() => {
    server = new Server(8080);
    server.on('connection', (socket: SocketIO.Socket) => connHandler(socket));
  });

  after(() => { server.close(); });

  it("request should send a request frame to the server", (done) => {
    var ioSocket: SocketIO.Socket = Socket.connect('http://localhost:8080', options);
    var client: SocketIOClient = new SocketIOClient(ioSocket);

    var requestFrame: RequestFrame = {key: key, context: context};

    connHandler = (socket: SocketIO.Socket) => {
      socket.on('request', (frame: RequestFrame) => {
        expect(frame).to.deep.equal(requestFrame);
        socket.disconnect(true);
        done();
      });
    };

    client.request(key, context);
  });

  it("mutate should send a mutation frame to the server", (done) => {
    var ioSocket: SocketIO.Socket = Socket.connect('http://localhost:8080', options);
    var client: SocketIOClient = new SocketIOClient(ioSocket);

    var mutationFrame:
        MutationFrame = {key: key, base: 'foobase', data: {foo: 'baz'}, context: context};

    connHandler = (socket: SocketIO.Socket) => {
      socket.on('mutation', (frame: MutationFrame) => {
        expect(frame).to.deep.equal(mutationFrame);
        socket.disconnect(true);
        done();
      });
    };

    client.mutate(key, mutationFrame.data, mutationFrame.base, context);
  });

  it("data should emit incoming data frames from the server", (done) => {
    var ioSocket: SocketIO.Socket = Socket.connect('http://localhost:8080', options);
    var client: SocketIOClient = new SocketIOClient(ioSocket);

    var dataFrame: DataFrame =
    { key: key,
      version: 'foobase',
      data: {foo: 'foo'},
      mutationContext: {id: '0'} }

    client.data()
        .subscribeOnNext((frame: DataFrame) => {
          expect(frame).to.deep.equal(dataFrame);
          ioSocket.disconnect(true);
          done();
        });

    connHandler = (socket: SocketIO.Socket) => { socket.emit('data', dataFrame); };
  });

  it("failed should emit incoming failure frames from the server", (done) => {
    var ioSocket: SocketIO.Socket = Socket.connect('http://localhost:8080', options);
    var client: SocketIOClient = new SocketIOClient(ioSocket);

    var failureFrame = {
      key: key,
      baseVersion: 'foobase',
      context: {id: '0'},
      reason: 'cause',
      debuggingInfo: {mutation: 'should fail'}
    };

    client.failed().subscribeOnNext((frame: FailureFrame) => {
      expect(frame).to.deep.equal(failureFrame);
      ioSocket.disconnect(true);
      done();
    });

    connHandler = (socket: SocketIO.Socket) => { socket.emit('failure', failureFrame); };
  });
});

describe('SocketIOServer', () => {
  var server: SocketIO.Server;
  var connHandler: Function = (socket: SocketIO.Socket): void => {};
  before(() => {
    server = new Server(8080);
    server.on('connection', (socket: SocketIO.Socket) => connHandler(socket));
  });

  after(() => { server.close(); });

  it("broadcast should send a data frame to all connected clients", (done) => {
    var clientA: SocketIO.Socket = Socket.connect('http://localhost:8080', options);
    var clientB: SocketIO.Socket = Socket.connect('http://localhost:8080', options);
    var socketServer: SocketIOServer = new SocketIOServer(null, server);
    var clients: number = 0;

    var dataFrame = {key: key, version: 'foobase', data: {foo: 'foo'}, mutationContext: null};

    var dataHandler: Function = (frame: DataFrame) => {
      expect(frame).to.deep.equal(dataFrame);
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
        socketServer.broadcastData(key, dataFrame.version, dataFrame.data);
      }
    };
  });
});