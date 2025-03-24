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
import {
  type AuthSyncMessage,
  type CommunitiesHandlerOptions,
  CommunityOperationStatus,
} from '../websocket/types/index.js'
import type { QuietLogger } from '../../app/logger/types.js'

export class AuthConnection {
  public readonly lfaConnection: LFAConnection
  public userContext: MemberContext
  public localUserContext: LocalUserContext

  private readonly logger = createLogger(`Communities:Auth:Connection`)
  private readonly createLfaLogger = (context: string): QuietLogger =>
    createLogger(`Localfirst:${context}`)

  constructor(
    private readonly sigChain: SigChain,
    private readonly wsOptions: CommunitiesHandlerOptions,
  ) {
    const user: UserWithSecrets = castServer.toUser(
      this.sigChain.context.server,
    ) as UserWithSecrets
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
    this.lfaConnection = new LFAConnection({
      context: this.userContext,
      sendMessage: (message: Uint8Array) => {
        const socketMessage: AuthSyncMessage = {
          ts: DateTime.utc().toMillis(),
          payload: {
            status: CommunityOperationStatus.Success,
            payload: {
              teamId: this.sigChain.team.id,
              message: uint8arrays.toString(message, 'base64'),
            },
          },
        }
        const encryptedSocketMessage = this.wsOptions.encryption.encrypt(
          socketMessage,
          this.wsOptions.sessionKey,
        )
        this.wsOptions.socket.emit(
          WebsocketEvents.AuthSync,
          encryptedSocketMessage,
        )
      },
      createLogger: this.createLfaLogger,
    })
  }

  public start(): void {
    // Set up auth connection event handlers.
    this.lfaConnection.on('connected', () => {
      this.logger.debug(`Sending sync message because our chain is initialized`)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- this is valid
      const { team, user } = this.userContext
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- this is valid
      this.lfaConnection.emit('sync', { team, user })
    })

    this.lfaConnection.on('disconnected', event => {
      this.logger.log(`LFA Disconnected!`, event)
    })

    this.lfaConnection.on('change', payload => {
      this.logger.log(`Auth state change`, payload)
    })

    // TODO: store updated sigchain on updates
    this.lfaConnection.on('updated', head => {
      this.logger.log('Received sync message, team graph updated', head)
    })

    // Handle errors from local or remote sources.
    this.lfaConnection.on('localError', error => {
      this.logger.error(`Local LFA error`, error)
    })
    this.lfaConnection.on('remoteError', error => {
      this.logger.error(`Remote LFA error`, error)
    })

    this.logger.log(
      `Auth connection established with Peer for ${(this.userContext.team as Team).id}`,
    )
    this.lfaConnection.start()
  }
}
