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
} from '@localfirst/auth'
import { WebsocketEvents } from '../../websocket/ws.types.js'
import { createLogger } from '../../app/logger/logger.js'
import { DateTime } from 'luxon'
import * as uint8arrays from 'uint8arrays'
import {
  type AuthSyncMessage,
  CommunityOperationStatus,
} from '../../websocket/handlers/types/index.js'
import type { QuietLogger } from '../../app/logger/types.js'
import { type AuthConnectionConfig, AuthStatus } from './types.js'
import EventEmitter from 'events'
import { type AuthDisconnectedPayload, AuthEvents } from './auth.events.js'

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
    private readonly userId: string,
    private readonly sigChain: SigChain,
    private readonly config: AuthConnectionConfig,
  ) {
    super()

    // convert the Server data on the chain to a User object
    const user: UserWithSecrets = castServer.toUser(
      this.sigChain.context.server,
    ) as UserWithSecrets
    // convert the Server data on the chain to a Device object
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- cast is valid for server context
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
        const socketMessage: AuthSyncMessage = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.SUCCESS,
          payload: {
            userId: user.userId,
            teamId: this.sigChain.team.id,
            message: uint8arrays.toString(message, 'base64'),
          },
        }
        this.config.socket.emit(WebsocketEvents.AuthSync, socketMessage)
      },
      createLogger: this.createLfaLogger,
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
    this.lfaConnection.on('connected', () => {
      try {
        this.logger.debug(
          `Sending sync message because our chain is initialized`,
        )
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- this is valid
        const { team, user } = this.userContext
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- this is valid
        this.lfaConnection.emit('sync', { team, user })
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- team is valid
        const teamId = team.id
        this._status = AuthStatus.JOINED
        this.logger.debug(
          'Joining new socket to room on sign-in',
          this.config.socket.id,
          teamId,
        )
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- teamId is a valid string
        void this.config.socket.join(teamId)
      } catch (e) {
        this.logger.error('Error while sending auth sync message', e)
      }
    })

    // handle disconnects
    this.lfaConnection.on('disconnected', event => {
      this.logger.log(`LFA Disconnected!`, event)
      this._status = AuthStatus.REJECTED_OR_CLOSED
      const payload: AuthDisconnectedPayload = {
        userId: this.userId,
        teamId: this.sigChain.team.id,
      }
      this.emit(AuthEvents.AuthDisconnected, payload)
      void this.config.socket.leave(this.sigChain.team.id)
    })

    // handle chain updates
    this.lfaConnection.on('updated', head => {
      try {
        this.logger.debug('Received sync message, team graph updated', head)
        this.sigChain.emit('update')
      } catch (e) {
        this.logger.error(
          'Error while processing received auth sync message',
          e,
        )
      }
    })

    // Handle errors from local or remote sources.
    this.lfaConnection.on('localError', error => {
      this.logger.error(`Local LFA error`, error)
    })
    this.lfaConnection.on('remoteError', error => {
      this.logger.error(`Remote LFA error`, error)
    })

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-type-assertion -- team is valid
    const teamId = this.userContext.team.id as string
    this.logger.log(`Auth connection established with Peer for ${teamId}`)
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
