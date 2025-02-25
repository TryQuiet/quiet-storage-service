import { TestingModule } from '@nestjs/testing/testing-module';
import { INestApplication } from '@nestjs/common/interfaces';
import Fastify from 'fastify';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { NestFastifyLogger } from '../../src/nest/app/nest.fastify.logger';
import { Logger } from '@nestjs/common';
import { connect, Socket as ClientSocket } from 'socket.io-client';
import { Server, Socket as ServerSocket } from 'socket.io';
import { WebsocketGateway } from '../../src/nest/websocket/ws.gateway';
import { NativeClientEvents, TestSockets } from './types';
import { sleep } from '../../src/nest/utils/sleep';

export class TestUtils {
    public static clientSocket: ClientSocket;
    public static serverSocket: ServerSocket
    public static server: Server
    private static module: TestingModule
    private static adapter: FastifyAdapter;
    private static app: INestApplication;
    private static logger = new Logger(TestUtils.name)

    public static async startServer(testingModule: TestingModule): Promise<void> {
        this.module = testingModule
        // @ts-expect-error Type is correct
        this.adapter = new FastifyAdapter(Fastify({
          logger: new NestFastifyLogger(),
        }))
        this.app = this.module.createNestApplication<NestFastifyApplication>(this.adapter, { logger: new Logger('Test')});
        this.logger.log(`Starting server`)
        await this.app.init();
        await this.app.listen(3004);
    }

    public static async createSocket(): Promise<TestSockets> {
      this.logger.log(`Creating client socket`)
      this.clientSocket = connect(
          `ws://${process.env.HOSTNAME}:${process.env.PORT}`,
          {
              autoConnect: true,
              forceNew: true,
              transports: ["websocket"]
          },
      );
      await this._waitForConnect()

      return {
        client: this.clientSocket,
        server: this.serverSocket
      };
    }

    private static async _waitForConnect(): Promise<void> {
      this.server = this.module.get<WebsocketGateway>(WebsocketGateway).io
      this.server.on('connection', (newSocket) => {
          this.serverSocket = newSocket
      })
      this.clientSocket.on(NativeClientEvents.CONNECT, () => {
        if (this.server.sockets.sockets.size !== 1) {
            throw new Error(`Expected 1 connected client, got ${this.server.sockets.sockets.size}`)
        }
      })
      let count = 20
      while(!this.clientSocket.connected) {
        if (count < 0) {
            throw new Error(`Client didn't connect in time!`)
        }

        this.logger.log(`Waiting for client to finish connecting...`)
        await sleep(500)
      }
    }

    public static async close() {
      this.logger.log(`Closing client socket and server`)
        this.clientSocket.close();
        await this.app.close();
    }
}