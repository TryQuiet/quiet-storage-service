/**
 * LFA auth sync connection wrapper
 */

import type { SigChain } from './sigchain.js'
import {
  castServer,
  type DeviceWithSecrets,
  Connection as LFAConnection,
  type UserWithSecrets,
  type LocalUserContext,
  type MemberContext,
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

interface AuthenticatedPeerIdentity {
  peer?: { userId: string }
  theirDevice?: { deviceId: string }
}

export class AuthConnection extends EventEmitter {
  /**
   * Auth sync connection
   */
  public readonly lfaConnection: LFAConnection
  /**
   * Member context cast from Server
   */
  public userContext: MemberContext
  /**
   * User context cast from Server
   */
  public localUserContext: LocalUserContext
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
    public readonly userId: string,
    public readonly deviceId: string,
    private readonly sigChain: SigChain,
    private readonly config: AuthConnectionConfig,
  ) {
    super()

    // convert the Server data on the chain to a User object
    const user: UserWithSecrets = castServer.toUser(
      this.sigChain.context.server,
    ) as UserWithSecrets
    // convert the Server data on the chain to a Device object
    const device: DeviceWithSecrets = castServer.toDevice(
      this.sigChain.context.server,
    ) as DeviceWithSecrets
    this.userContext = {
      user,
      device,
      team: this.sigChain.team,
    }
    this.localUserContext = {
      user,
      device,
    }
    // create a new LFA auth sync connection that routes auth sync messages through an existing websocket connection
    this.lfaConnection = new LFAConnection({
      context: this.userContext,
      sendMessage: (message: Uint8Array) => {
        if (message.byteLength >= AUTH_SYNC_LARGE_MESSAGE_BYTES) {
          this.logger.warn(
            `Outbound auth-sync message is large: ${this.logContext} status=${this._status} bytes=${message.byteLength}`,
          )
        }
        this.logger.debug(
          `Routing outbound auth-sync through mapped connection: ${this.logContext} status=${this._status} bytes=${message.byteLength}`,
        )
        const socketMessage: AuthSyncMessage = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.SUCCESS,
          payload: {
            userId: this.userId,
            deviceId: this.deviceId,
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

  private get logContext(): string {
    return `teamId=${this.sigChain.team.id} userId=${this.userId} deviceId=${this.deviceId} socketId=${this.socketId}`
  }

  /**
   * Start the auth sync connection and handle connection events
   */
  public start(): void {
    // Set up auth connection event handlers.
    this.lfaConnection.on(LFAEvents.CONNECTED, async () => {
      try {
        const { peer, theirDevice } = this.lfaConnection
          ._context as AuthenticatedPeerIdentity
        this.logger.debug(
          `LFA authenticated peer identity: ${this.logContext} authenticatedUserId=${peer?.userId ?? 'unknown'} authenticatedDeviceId=${theirDevice?.deviceId ?? 'unknown'}`,
        )
        if (
          peer?.userId !== this.userId ||
          theirDevice?.deviceId !== this.deviceId
        ) {
          this.logger.warn(
            `Rejecting auth connection because authenticated identity did not match requested session: ${this.logContext} authenticatedUserId=${peer?.userId ?? 'unknown'} authenticatedDeviceId=${theirDevice?.deviceId ?? 'unknown'}`,
          )
          this.stop()
          return
        }

        this.logger.debug(
          `LFA authentication completed; sending initial sync: ${this.logContext} previousStatus=${this._status}`,
        )
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- this is valid
        const { team, user } = this.userContext
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- this is valid
        this.lfaConnection.emit('sync', { team, user })
        const teamId = (team as Team).id
        this._status = AuthStatus.JOINED
        this.logger.debug(
          `Auth connection joined; adding socket to team room: ${this.logContext} status=${this._status}`,
        )
        await this.config.socket.join(teamId)
        this.logger.debug(
          `Socket joined team room for auth connection: ${this.logContext}`,
        )
      } catch (e) {
        this.logger.error(
          `Error while completing auth connection: ${this.logContext}`,
          e,
        )
      }
    })

    // handle disconnects
    this.lfaConnection.on(LFAEvents.DISCONNECTED, () => {
      const previousStatus = this._status
      this._status = AuthStatus.REJECTED_OR_CLOSED
      this.logger.debug(
        `LFA auth connection disconnected: ${this.logContext} previousStatus=${previousStatus} status=${this._status}`,
      )
      const payload: AuthDisconnectedPayload = {
        userId: this.userId,
        deviceId: this.deviceId,
        teamId: this.sigChain.team.id,
      }
      this.emit(AuthEvents.AuthDisconnected, payload)
    })

    // handle chain updates
    this.lfaConnection.on(LFAEvents.UPDATED, head => {
      try {
        this.logger.debug(
          `Auth connection updated team graph: ${this.logContext}`,
          head,
        )
      } catch (e) {
        this.logger.error(
          `Error while processing received auth sync message: ${this.logContext}`,
          e,
        )
      }
    })

    // Handle errors from local or remote sources.
    this.lfaConnection.on(LFAEvents.LOCAL_ERROR, error => {
      this.logger.error(`Local LFA error: ${this.logContext}`, error)
    })
    this.lfaConnection.on(LFAEvents.REMOTE_ERROR, error => {
      this.logger.error(`Remote LFA error: ${this.logContext}`, error)
    })

    this.logger.debug(
      `Starting LFA auth connection: ${this.logContext} previousStatus=${this._status}`,
    )
    this._status = AuthStatus.JOINING
    this.lfaConnection.start()
    this.logger.debug(
      `LFA auth connection start invoked: ${this.logContext} status=${this._status}`,
    )
  }

  /**
   * Stop the auth sync connection
   */
  public stop(): void {
    this.logger.debug(
      `Stopping LFA auth connection: ${this.logContext} status=${this._status}`,
    )
    this.lfaConnection.stop(true)
    this.logger.debug(
      `LFA auth connection stop invoked: ${this.logContext} status=${this._status}`,
    )
    const payload: AuthDisconnectedPayload = {
      userId: this.userId,
      deviceId: this.deviceId,
      teamId: this.sigChain.team.id,
    }
    this.emit(AuthEvents.AuthDisconnected, payload)
  }
}
