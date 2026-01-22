/**
 * Abstraction of LFA auth sync connection logic for QSS
 */
import {
  Connection as AuthConnection,
  DeviceWithSecrets,
  InviteeMemberContext,
  Keyring,
  Team,
  User,
  type MemberContext,
} from '@localfirst/auth'
import { DateTime } from 'luxon'
import * as uint8arrays from 'uint8arrays'
import EventEmitter from 'events'
import { Injectable } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { createLogger } from '../nest/app/logger/logger.js'
import { WebsocketClient } from './ws.client.js'
import { AuthSyncMessage } from '../nest/websocket/handlers/types/auth-sync.types.js'
import { CommunityOperationStatus } from '../nest/websocket/handlers/types/common.types.js'
import { WebsocketEvents } from '../nest/websocket/ws.types.js'
import { ClientEvents } from './ws.client.events.js'
import { QuietLogger } from '../nest/app/logger/types.js'

@Injectable()
export class QSSClientAuthConnection extends EventEmitter {
  /**
   * LFA auth sync connection instance
   */
  private authConnection: AuthConnection | undefined = undefined
  /**
   * True when connected and operational
   */
  private _active = false
  /**
   * Random ID for this connection
   */
  private readonly _id: string
  /**
   * Are we syncing with QSS?
   */
  private readonly _syncing = false

  private readonly logger: QuietLogger
  private readonly createLfaLogger: (packageName: string) => QuietLogger

  constructor(
    public readonly teamId: string,
    private readonly client: WebsocketClient,
    private context: MemberContext | InviteeMemberContext,
  ) {
    super()
    this._id = randomUUID()
    this.logger = createLogger(
      `qss:auth:conn:client:${this.context.user.userName}`,
    )
    this.createLfaLogger = (packageName: string) =>
      createLogger(
        `localfirst:qss:client:${this.context.user.userName}:${packageName}`,
      )
  }

  public get active(): boolean {
    return this._active
  }

  public get id(): string {
    return this._id
  }

  public get syncing(): boolean {
    return this._syncing
  }

  /**
   * Starts this auth sync connection with QSS
   *
   */
  public start(): void {
    if (this.teamId == null) {
      throw new Error('Must set team ID prior to starting connection!')
    }

    if (this.authConnection != null) {
      // if we have an existing auth connection for this team check if it has been started and is active, if so
      // do nothing
      if (this.authConnection._started && this._active) {
        this.logger.error(
          `Auth connection already started with QSS for this team`,
          this.teamId,
        )
        return
      }
      // if the existing connection is inactive just start it later in this method
      this.logger.warn(
        `Existing auth connection with QSS for this team was found but the connection wasn't started, startin now`,
        this.teamId,
      )
    } else {
      // create a new auth connection backed by the existing QSS websocket connection
      this.authConnection = new AuthConnection({
        context: this.context,
        sendMessage: async (message: Uint8Array) => {
          const socketMessage: AuthSyncMessage = {
            ts: DateTime.utc().toMillis(),
            status: CommunityOperationStatus.SENDING,
            payload: {
              userId: this.context.user.userId,
              teamId: this.teamId,
              message: uint8arrays.toString(message, 'base64'),
            },
          }
          await this.client.sendMessage(
            WebsocketEvents.AuthSync,
            socketMessage,
            false,
          )
        },
        createLogger: this.createLfaLogger,
      })
    }

    this.logger.info(`Starting auth connection with QSS for syncing`)

    // pass auth sync messages received on the websocket to the auth connection
    this.client.clientSocket!.on(
      WebsocketEvents.AuthSync,
      (message: AuthSyncMessage): void => {
        try {
          if (message.payload.message == null) {
            throw new Error(`Missing message`)
          }
          this.authConnection!.deliver(
            uint8arrays.fromString(message.payload.message, 'base64'),
          )
        } catch (e) {
          this.logger.error(`Error handling auth sync message`, e)
          this.authConnection!.emit('localError', {
            message: 'Error handling auth sync message',
            type: 'ClientAuthSyncError',
          })
        }
      },
    )

    // handle connected events and update the sigchain/join status
    this.authConnection.on('connected', () => {
      this._active = true
      if ((this.context as MemberContext).team != null) {
        this.logger.debug(
          `Sending sync message because our chain is initialized`,
        )
        this.authConnection!.emit('sync', {
          team: (this.context as MemberContext).team as Team,
          user: this.context.user,
        })
        this.emit(ClientEvents.AuthJoined) // tell others we have joined
      }
    })

    // set the connection to inactive when disconnecting
    this.authConnection.on('disconnected', event => {
      this.logger.info(`LFA Disconnected!`, event)
      this._active = false
      this.emit(ClientEvents.AuthDisconnected, event)
    })

    // handle joined events
    this.authConnection.on(
      'joined',
      (payload: { team: Team; user: User; teamKeyring: Keyring }) => {
        const { team, user } = payload
        this.logger.info(
          `${this.context.user.userId}: Joined team ${team.teamName} (userid: ${user.userId})!`,
        )
        // if we didn't have a team on the sigchain previously then it is assumed that we haven't connected to a peer yet
        // and thus don't have the member role so our joining is still pending
        if ((this.context as MemberContext).team == null) {
          this.logger.info(
            `${user.userId}: Creating SigChain for user with name ${user.userName} and team name ${team.teamName}`,
          )
          this.context = {
            device: this.context.device as DeviceWithSecrets,
            team,
            user,
          }
        }
        this.emit(ClientEvents.AuthJoined) // tell others we have joined
      },
    )

    this.authConnection.on('change', payload => {
      this.logger.verbose(`Auth state change`, payload)
    })

    this.authConnection.on('updated', head => {
      this.logger.verbose('Received sync message, team graph updated', head)
    })

    // Handle errors from local or remote sources.
    this.authConnection.on('localError', error => {
      this.logger.error(`Local LFA error`, error)
    })
    this.authConnection.on('remoteError', error => {
      this.logger.error(`Remote LFA error`, error)
    })

    this.logger.info(`Auth connection established with QSS`)
    this.authConnection.start()
    this._active = true
  }

  /**
   * Stop this QSS auth connection and set to inactive
   *
   * @param sendDisconnectToQSS If true send a disconnect message to QSS on closure
   */
  public stop(sendDisconnectToQSS = false): void {
    if (this.authConnection == null) {
      this.logger.warn(
        `Auth connection not open with QSS for this team`,
        this.teamId,
      )
      return
    }
    try {
      this.authConnection.stop(sendDisconnectToQSS)
    } catch (e) {
      this.logger.error(
        `Error while stopping auth connection with QSS for team ID ${this.teamId}`,
        e,
      )
    } finally {
      this._active = false
    }
  }
}
