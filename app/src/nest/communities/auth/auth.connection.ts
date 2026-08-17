/**
 * LFA auth sync connection wrapper
 */

import type { SigChain } from './sigchain.js'
import {
  castServer,
  Connection as LFAConnection,
  type ServerContext,
  type UserWithSecrets,
  type Team,
} from '@localfirst/auth'
import { WebsocketEvents } from '../../websocket/ws.types.js'
import { createLogger } from '../../app/logger/logger.js'
import { DateTime } from 'luxon'
import * as uint8arrays from 'uint8arrays'
import { ConfigService } from '../../utils/config/config.service.js'
import { EnvVars } from '../../utils/config/env_vars.js'
import {
  type AuthSyncMessage,
  CommunityOperationStatus,
} from '../../websocket/handlers/types/index.js'
import type { QuietLogger } from '../../app/logger/types.js'
import { type AuthConnectionConfig, AuthStatus, LFAEvents } from './types.js'
import EventEmitter from 'events'
import { type AuthDisconnectedPayload, AuthEvents } from './auth.events.js'

// Warn when an auth-sync payload approaches socket.io's per-message buffer cap.
// Default cap is 1 MiB; we run with 8 MiB plus deflate, but anything ≥512 KiB
// is worth flagging so we notice graph growth before it bites.
const AUTH_SYNC_LARGE_MESSAGE_BYTES = 512 * 1024

export class AuthConnection extends EventEmitter {
  /**
   * Auth sync connection
   */
  public readonly lfaConnection: LFAConnection
  /**
   * Connection context — this server participating as a first-class server on the team.
   */
  public serverContext: ServerContext
  /**
   * The server cast to a user, for the sync-event payload and outbound-message routing id.
   */
  private readonly localUser: UserWithSecrets
  /**
   * Current status of this auth connection (e.g. has the user been authenticated)
   */
  private _status: AuthStatus = AuthStatus.PENDING

  /**
   * Generate a new logger for this auth sync connection
   *
   * @param loggingContext Context of this logger
   * @returns New logger instance for a given LFA connection
   */
  private readonly createLfaLogger = (loggingContext: string): QuietLogger =>
    createLogger(`Localfirst:${loggingContext}`)

  private readonly logger = createLogger(`Communities:Auth:Connection`)

  constructor(
    private readonly userId: string,
    private readonly sigChain: SigChain,
    private readonly config: AuthConnectionConfig,
  ) {
    super()

    const server = this.sigChain.context.server
    // This server participates as a first-class server on the team: its identity is its serverId,
    // and localfirst/auth derives whatever user-shaped view it needs internally (extendServerContext
    // casts the server to a user for the handshake). We no longer fake a device — servers don't have
    // one.
    this.serverContext = {
      server,
      team: this.sigChain.team,
    }
    // The server cast to a user, used for the sync-event payload and as the routing id on outbound
    // auth-sync messages (stable across calls for the same server).
    this.localUser = castServer.toUser(server) as UserWithSecrets
    // create a new LFA auth sync connection that routes auth sync messages through an existing websocket connection
    this.lfaConnection = new LFAConnection({
      context: this.serverContext,
      sendMessage: (message: Uint8Array) => {
        if (message.byteLength >= AUTH_SYNC_LARGE_MESSAGE_BYTES) {
          this.logger.warn(
            `Outbound auth-sync message is large: ${message.byteLength} bytes (user=${this.localUser.userId}, team=${this.sigChain.team.id})`,
          )
        }
        const socketMessage: AuthSyncMessage = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.SUCCESS,
          payload: {
            userId: this.localUser.userId,
            teamId: this.sigChain.team.id,
            message: uint8arrays.toString(message, 'base64'),
          },
        }
        this.config.socket.emit(WebsocketEvents.AuthSync, socketMessage)
      },
      ...(ConfigService.getBool(
        EnvVars.LOCALFIRST_DEBUG_LOGGING_ENABLED,
        false,
      ) === true && {
        createLogger: this.createLfaLogger,
      }),
    })
  }

  public get status(): AuthStatus {
    return this._status
  }

  public get socketId(): string {
    return this.config.socket.id
  }

  /**
   * Start the auth sync connection and handle connection events
   */
  public start(): void {
    // Set up auth connection event handlers.
    this.lfaConnection.on(LFAEvents.CONNECTED, async () => {
      try {
        this.logger.debug(
          `Sending sync message because our chain is initialized`,
        )
        const { team } = this.serverContext
        this.lfaConnection.emit('sync', { team, user: this.localUser })
        const teamId = (team as Team).id
        this._status = AuthStatus.JOINED
        this.logger.debug(
          'Joining new socket to room on sign-in',
          this.config.socket.id,
          teamId,
        )
        await this.config.socket.join(teamId)
      } catch (e) {
        this.logger.error('Error while sending auth sync message', e)
      }
    })

    // handle disconnects
    this.lfaConnection.on(LFAEvents.DISCONNECTED, () => {
      this.logger.debug(`LFA disconnected`)
      this._status = AuthStatus.REJECTED_OR_CLOSED
      const payload: AuthDisconnectedPayload = {
        userId: this.userId,
        teamId: this.sigChain.team.id,
      }
      this.emit(AuthEvents.AuthDisconnected, payload)
    })

    // handle chain updates
    this.lfaConnection.on(LFAEvents.UPDATED, head => {
      try {
        this.logger.debug('Received sync message, team graph updated', head)
      } catch (e) {
        this.logger.error(
          'Error while processing received auth sync message',
          e,
        )
      }
    })

    // Handle errors from local or remote sources.
    this.lfaConnection.on(LFAEvents.LOCAL_ERROR, error => {
      this.logger.error(`Local LFA error`, error)
    })
    this.lfaConnection.on(LFAEvents.REMOTE_ERROR, error => {
      this.logger.error(`Remote LFA error`, error)
    })

    this.logger.log(
      `Auth connection established with Peer for ${(this.serverContext.team as Team).id}`,
    )
    this._status = AuthStatus.JOINING
    this.lfaConnection.start()
  }

  /**
   * Stop the auth sync connection
   */
  public stop(): void {
    this.logger.debug('Closing connection with user')
    this.lfaConnection.stop(true)
    const payload: AuthDisconnectedPayload = {
      userId: this.userId,
      teamId: this.sigChain.team.id,
    }
    this.emit(AuthEvents.AuthDisconnected, payload)
  }
}
