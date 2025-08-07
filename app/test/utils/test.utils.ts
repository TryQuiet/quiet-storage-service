import { TestingModule } from '@nestjs/testing/testing-module'
import { INestApplication } from '@nestjs/common/interfaces'
import Fastify from 'fastify'
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { NestFastifyLogger } from '../../src/nest/app/logger/nest.fastify.logger.js'
import { Server, Socket as ServerSocket } from 'socket.io'
import { WebsocketGateway } from '../../src/nest/websocket/ws.gateway.js'
import { TestClient, TestSockets } from './types.js'
import { WebsocketClient } from '../../src/client/ws.client.js'
import { createLogger } from '../../src/nest/app/logger/logger.js'
import { LISTEN_PORT } from '../../src/nest/app/const.js'
import { QSSClientAuthConnection } from '../../src/client/client-auth-conn.js'
import { InviteeMemberContext, MemberContext } from '@localfirst/auth'

export class TestUtils {
  public static clients: Map<string, TestClient> = new Map()
  public static server: Server
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
    this.logger.log(`Starting server`)
    await this.app.init()
    await this.app.listen(this.app.get<number>(LISTEN_PORT))
  }

  public static async connectClient(username: string): Promise<TestClient> {
    this.logger.log(`Creating and connecting client socket`)
    const client = this.app.get<WebsocketClient>(WebsocketClient)
    this.server = this.module.get<WebsocketGateway>(WebsocketGateway).io
    let serverSocket: ServerSocket | undefined = undefined
    this.server.on('connection', newSocket => {
      serverSocket = newSocket
    })

    const clientSocket = await client.createSocket()

    const sockets: TestSockets = {
      client: clientSocket,
      server: serverSocket!,
    }
    const testClient: TestClient = {
      client,
      sockets,
    }
    this.clients.set(username, testClient)
    return testClient
  }

  public static async startAuthConnection(
    teamId: string,
    context: MemberContext | InviteeMemberContext,
  ): Promise<QSSClientAuthConnection> {
    const client = this.clients.get(context.user.userName)
    if (client == null) {
      throw new Error(
        `No test client initialized for user ${context.user.userName}`,
      )
    }

    const authConnection = new QSSClientAuthConnection(
      teamId,
      client.client,
      context,
    )
    authConnection.start()
    this.clients.set(context.user.userId, { ...client, authConnection })
    return authConnection
  }

  public static getOpenConnectionCount(): number {
    return this.server?.sockets.sockets.size
  }

  public static async close() {
    this.logger.log(`Closing client sockets and server`)
    for (const testClient of this.clients.values()) {
      testClient.authConnection?.stop(true)
      testClient.client.close()
    }
    await this.app.close()
  }
}
