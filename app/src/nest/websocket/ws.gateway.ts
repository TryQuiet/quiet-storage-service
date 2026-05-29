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

import {
  formatSocketAttribution,
  formatSocketPeer,
  getClientIp,
  type BaseHandlerConfig,
  type QuietSocket,
} from './ws.types.js'
import { createLogger } from '../app/logger/logger.js'
import { registerCommunitiesHandlers } from './handlers/communities.handler.js'
import { CommunitiesStorageService } from '../communities/storage/communities.storage.service.js'
import { CommunitiesManagerService } from '../communities/communities-manager.service.js'
import {
  CaptchaHandlerConfig,
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
import { CaptchaService } from '../utils/captcha.js'

const RATE_LIMIT_WINDOW_MS = 10_000
const RATE_LIMIT_MAX_IN_WINDOW = 10
const MAX_CONCURRENT_PER_IP = 5

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

  // Per-IP sliding window of connection timestamps for rate limiting
  private readonly _connectionRates = new Map<string, number[]>()

  // Active socket ID → client IP, used to count concurrent connections per IP
  private readonly _socketIps = new Map<string, string>()

  // eslint-disable-next-line @typescript-eslint/max-params -- NestJS requires constructor injection
  constructor(
    private readonly communityStorageService: CommunitiesStorageService,
    private readonly communitiesDataStorageService: LogEntrySyncStorageService,
    private readonly communitiesManager: CommunitiesManagerService,
    private readonly logEntrySyncManager: LogEntrySyncManager,
    private readonly captchaService: CaptchaService,
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
    const { id, rooms } = client
    const { io, logger } = this
    const _logger = logger.extend(id)
    const { sockets: namespace } = io
    const { sockets } = namespace

    const ip = getClientIp(client)

    // Reject if this IP already has too many concurrent connections
    let concurrentCount = 0
    for (const storedIp of this._socketIps.values()) {
      if (storedIp === ip) concurrentCount++
    }
    if (concurrentCount >= MAX_CONCURRENT_PER_IP) {
      _logger.warn(
        `Max concurrent connections (${MAX_CONCURRENT_PER_IP}) exceeded for ${formatSocketPeer(client)}, disconnecting`,
      )
      client.disconnect(true)
      return
    }

    // Reject if this IP is connecting too rapidly
    const now = Date.now()
    const windowStart = now - RATE_LIMIT_WINDOW_MS
    const recentTimestamps = (this._connectionRates.get(ip) ?? []).filter(
      t => t >= windowStart,
    )
    recentTimestamps.push(now)
    this._connectionRates.set(ip, recentTimestamps)
    if (recentTimestamps.length > RATE_LIMIT_MAX_IN_WINDOW) {
      _logger.warn(
        `Rate limit exceeded (${recentTimestamps.length} connections in ${RATE_LIMIT_WINDOW_MS}ms) for ${formatSocketPeer(client)}, disconnecting`,
      )
      client.disconnect(true)
      return
    }

    this._socketIps.set(id, ip)

    _logger.debug(
      `Client connected: ${formatSocketAttribution(client)} ${formatSocketPeer(client)} rooms=${JSON.stringify([...rooms])} connectedClients=${sockets.size}`,
    )
    _logger.debug(`Current connected clients: ${sockets.size}`)

    // register all websocket event handlers on this socket
    this._registerEventHandlers(client)
  }

  /**
   * Called on all client disconnects
   *
   * @param client Socket connection with a new client
   */
  handleDisconnect(client: QuietSocket): void {
    const { id } = client
    const { io, logger } = this
    const _logger = logger.extend(id)
    const { sockets: namespace } = io
    const { sockets } = namespace

    this._socketIps.delete(id)

    _logger.debug(
      `Client disconnected: ${formatSocketAttribution(client)} ${formatSocketPeer(client)} connectedClients=${sockets.size}`,
    )
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
    const captchaConfig: CaptchaHandlerConfig = {
      ...baseConfig,
      captchaService: this.captchaService,
    }
    registerCommunitiesHandlers(communitiesConfig)
    registerCommunitiesAuthHandlers(communitiesConfig)
    registerCaptchaHandlers(captchaConfig)
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
