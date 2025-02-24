import { Logger } from '@nestjs/common'
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'

import { Server, Socket } from 'socket.io'
import { registerPingHandlers } from './handlers/ping.handler.js'

const DEFAULT_ROOMS: string[] = ['messages']

@WebSocketGateway({
  transports: ['websocket'],
  cors: {
    origin: '*',
  },
  path: '/socket.io',
  allowEIO3: true,
})
export class SocketGateway
  implements OnGatewayInit, OnGatewayConnection<Socket>, OnGatewayDisconnect
{
  private readonly logger = new Logger(SocketGateway.name)

  // @ts-expect-error Initialized by Nest
  @WebSocketServer() io: Server

  afterInit(): void {
    this.logger.log('Initialized')
    this.io.socketsJoin(DEFAULT_ROOMS)
  }

  handleConnection(client: Socket, ...args: unknown[]): void {
    // eslint-disable-next-line @typescript-eslint/prefer-destructuring -- Decomposing from `this` is wild
    const { sockets } = this.io.sockets

    this.logger.log(
      `Client id: ${client.id} connected`,
      `Rooms: ${JSON.stringify([...client.rooms])}`,
    )
    this.logger.debug(`Number of connected clients: ${sockets.size}`)
    registerPingHandlers(this.io, client)
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Cliend id:${client.id} disconnected`)
  }
}
