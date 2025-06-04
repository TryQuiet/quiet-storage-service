/**
 * Manages the websocket server and websocket event handler initialization
 */

import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { OnModuleDestroy } from '@nestjs/common'

import { BaseHandlerOptions } from './ws.types.js'
import { createLogger } from '../app/logger/logger.js'
import { registerCommunitiesHandlers } from '../communities/websocket/communities.handler.js'
import { CommunitiesStorageService } from '../communities/storage/communities.storage.service.js'
import { CommunitiesManagerService } from '../communities/communities-manager.service.js'
import { CommunitiesHandlerOptions } from '../communities/websocket/types/index.js'
import { registerCommunitiesAuthHandlers } from '../communities/websocket/auth.handler.js'

/**
 * Websocket gateway configuration
 */
@WebSocketGateway({
  cors: {
    origin: '*',
  },
  transports: ['websocket'],
  path: '/socket.io',
  allowUpgrades: true,
  allowEIO3: false,
})
export class WebsocketGateway
  implements
    OnGatewayInit,
    OnGatewayConnection<Socket>,
    OnGatewayDisconnect,
    OnModuleDestroy
{
  private readonly logger = createLogger(WebsocketGateway.name)

  // @ts-expect-error Initialized by Nest
  // Socket.io Server instance
  @WebSocketServer() io: Server

  constructor(
    private readonly communityStorageService: CommunitiesStorageService,
    private readonly communitiesManager: CommunitiesManagerService,
  ) {}

  afterInit(): void {
    // do nothing for now
  }

  /**
   * Close the websocket server when shutting down the server
   */
  public async onModuleDestroy(): Promise<void> {
    await this.io.close()
  }

  /**
   * Called on any new client connection
   *
   * @param client Socket connection with a new client
   * @param args Extra arguments to the connection
   */
  handleConnection(client: Socket, ...args: unknown[]): void {
    const _logger = this.logger.extend(client.id)
    const { sockets } = this.io.sockets

    _logger.log(
      `Client id: ${client.id} connected, Rooms: ${JSON.stringify([...client.rooms])}`,
    )
    _logger.debug(`Number of connected clients: ${sockets.size}`)

    // register all websocket event handlers on this socket
    this._registerEventHandlers(client)
  }

  /**
   * Called on all client disconnects
   *
   * @param client Socket connection with a new client
   */
  handleDisconnect(client: Socket): void {
    const _logger = this.logger.extend(client.id)
    _logger.log(`Client id:${client.id} disconnected`)
  }

  /**
   * Register all event handlers for a given client
   *
   * @param client Socket connection with a new client
   */
  private _registerEventHandlers(client: Socket): void {
    const baseOptions: BaseHandlerOptions = {
      socketServer: this.io,
      socket: client,
    }

    const communitiesOptions: CommunitiesHandlerOptions = {
      ...baseOptions,
      storage: this.communityStorageService,
      communitiesManager: this.communitiesManager,
    }
    registerCommunitiesHandlers(communitiesOptions)
    registerCommunitiesAuthHandlers(communitiesOptions)
  }
}
