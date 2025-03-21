import { TestingModule } from '@nestjs/testing/testing-module'
import { INestApplication } from '@nestjs/common/interfaces'
import Fastify from 'fastify'
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { NestFastifyLogger } from '../../src/nest/app/logger/nest.fastify.logger'
import { Logger } from '@nestjs/common'
import { Server, Socket as ServerSocket } from 'socket.io'
import { WebsocketGateway } from '../../src/nest/websocket/ws.gateway'
import { TestSockets } from './types'
import { WebsocketClient } from '../../src/client/ws.client'
import { WebsocketEncryptionService } from '../../src/nest/encryption/ws.enc.service'
import { createLogger } from '../../src/nest/app/logger/logger.js'
import { LISTEN_PORT } from '../../src/nest/app/const'

export class TestUtils {
  public static client: WebsocketClient
  public static serverSocket: ServerSocket
  public static server: Server
  public static encryption: WebsocketEncryptionService
  private static module: TestingModule
  private static adapter: FastifyAdapter
  private static app: INestApplication

  private static logger = createLogger(TestUtils.name)

  public static async startServer(testingModule: TestingModule): Promise<void> {
    this.module = testingModule
    this.adapter = new FastifyAdapter(
      // @ts-expect-error Type is correct
      Fastify({
        logger: new NestFastifyLogger(),
      }),
    )
    this.app = this.module.createNestApplication<NestFastifyApplication>(
      this.adapter,
      {
        logger: createLogger('Test'),
      },
    )
    this.encryption = this.app.get<WebsocketEncryptionService>(
      WebsocketEncryptionService,
    )
    this.client = this.app.get<WebsocketClient>(WebsocketClient)
    this.logger.log(`Starting server`)
    await this.app.init()
    await this.app.listen(this.app.get<number>(LISTEN_PORT))
  }

  public static async connectClient(): Promise<TestSockets> {
    this.logger.log(`Creating and connecting client socket`)
    this.server = this.module.get<WebsocketGateway>(WebsocketGateway).io
    this.server.on('connection', newSocket => {
      this.serverSocket = newSocket
    })

    const clientSocket = await this.client.createSocket()

    return {
      client: clientSocket,
      server: this.serverSocket,
    }
  }

  public static getOpenConnectionCount(): number {
    return this.server?.sockets.sockets.size
  }

  public static async close() {
    this.logger.log(`Closing client socket and server`)
    this.client.close()
    await this.app.close()
  }
}
