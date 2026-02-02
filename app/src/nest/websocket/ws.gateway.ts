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
import { Server } from 'socket.io'
import { Inject, OnModuleDestroy, Optional } from '@nestjs/common'

import { BaseHandlerConfig, QuietSocket } from './ws.types.js'
import { createLogger } from '../app/logger/logger.js'
import { registerCommunitiesHandlers } from './handlers/communities.handler.js'
import { CommunitiesStorageService } from '../communities/storage/communities.storage.service.js'
import { CommunitiesManagerService } from '../communities/communities-manager.service.js'
import {
  CommunitiesHandlerConfig,
  LogEntrySyncHandlerConfig,
  QPSHandlerConfig,
} from './handlers/types/index.js'
import { registerCommunitiesAuthHandlers } from './handlers/auth.handler.js'
import { LogEntrySyncStorageService } from '../communities/storage/log-entry-sync.storage.service.js'
import { registerLogEntrySyncHandlers } from './handlers/log-entry-sync.handler.js'
import { registerCaptchaHandlers } from './handlers/captcha.handler.js'
import { registerQpsHandlers } from './handlers/qps.handler.js'
import { LogEntrySyncManager } from '../communities/sync/log-entry-sync.service.js'
import { QPSService } from '../qps/qps.service.js'

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
    OnGatewayConnection<QuietSocket>,
    OnGatewayDisconnect,
    OnModuleDestroy
{
  private readonly logger = createLogger(WebsocketGateway.name)

  // @ts-expect-error Initialized by Nest
  // Socket.io Server instance
  @WebSocketServer() io: Server

  constructor(
    private readonly communityStorageService: CommunitiesStorageService,
    private readonly communitiesDataStorageService: LogEntrySyncStorageService,
    private readonly communitiesManager: CommunitiesManagerService,
    private readonly logEntrySyncManager: LogEntrySyncManager,
    @Optional() @Inject(QPSService) private readonly qpsService?: QPSService,
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
  handleConnection(client: QuietSocket, ...args: unknown[]): void {
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
  handleDisconnect(client: QuietSocket): void {
    const _logger = this.logger.extend(client.id)
    _logger.log(`Client id:${client.id} disconnected`)
  }

  /**
   * Register all event handlers for a given client
   *
   * @param client Socket connection with a new client
   */
  private _registerEventHandlers(client: QuietSocket): void {
    const baseConfig: BaseHandlerConfig = {
      socketServer: this.io,
      socket: client,
    }

    const communitiesConfig: CommunitiesHandlerConfig = {
      ...baseConfig,
      storage: this.communityStorageService,
      dataSyncStorage: this.communitiesDataStorageService,
      communitiesManager: this.communitiesManager,
    }

    const syncConfig: LogEntrySyncHandlerConfig = {
      ...baseConfig,
      syncManager: this.logEntrySyncManager,
    }
    registerCommunitiesHandlers(communitiesConfig)
    registerCommunitiesAuthHandlers(communitiesConfig)
    registerCaptchaHandlers(communitiesConfig)
    registerLogEntrySyncHandlers(syncConfig)

    if (this.qpsService != null) {
      const qpsConfig: QPSHandlerConfig = {
        ...baseConfig,
        qpsService: this.qpsService,
      }
      registerQpsHandlers(qpsConfig)
    }
  }
}
