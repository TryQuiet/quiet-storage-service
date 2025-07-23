/**
 * Auth websocket event handlers
 */

import { WebsocketEvents } from '../../websocket/ws.types.js'
import { DateTime } from 'luxon'
import { createLogger } from '../../app/logger/logger.js'
import {
  type AuthSyncMessage,
  CommunityOperationStatus,
  type GeneratePublicKeysMessage,
  type GeneratePublicKeysResponse,
  type CommunitiesHandlerConfig,
} from './types/index.js'
import * as uint8arrays from 'uint8arrays'
import type { AuthConnection } from '../auth/auth.connection.js'
import { type Keyset, redactKeys } from '@localfirst/crdx'
import { AllowedServerKeyState } from '../types.js'

const baseLogger = createLogger('Websocket:Event:Communities:Auth')

/**
 * Adds event handlers for auth-related events
 *
 * @param config Websocket handler config
 */
export function registerCommunitiesAuthHandlers(
  config: CommunitiesHandlerConfig,
): void {
  const _logger = baseLogger.extend(config.socket.id)
  _logger.debug(`Initializing communities auth WS event handlers`)

  /**
   * Generate new server keys for this community and return redacted keys to the user
   *
   * @param message Public key generation message
   * @param callback Callback for returning response
   */
  async function handleGeneratePublicKeys(
    message: GeneratePublicKeysMessage,
    callback: (payload: GeneratePublicKeysResponse) => void,
  ): Promise<void> {
    try {
      // generate the keys for this community and return to the user
      const keysetWithSecrets = await config.communitiesManager.getServerKeys(
        message.payload.teamId,
        AllowedServerKeyState.NOT_STORED,
      )
      const response: GeneratePublicKeysResponse = {
        ts: DateTime.utc().toMillis(),
        payload: {
          status: CommunityOperationStatus.SUCCESS,
          payload: {
            keys: redactKeys(keysetWithSecrets) as Keyset,
            teamId: message.payload.teamId,
          },
        },
      }
      callback(response)
    } catch (e) {
      _logger.error(`Error while processing get public keys event`, e)
      const errorResponse: GeneratePublicKeysResponse = {
        ts: DateTime.utc().toMillis(),
        payload: {
          status: CommunityOperationStatus.ERROR,
          reason: `Error while handling get public keys event`,
        },
      }
      callback(errorResponse)
    }
  }

  /**
   * Handle incoming auth sync message and pass along to the auth sync connection
   *
   * @param message Auth sync message
   */
  async function handleAuthSync(message: AuthSyncMessage): Promise<void> {
    let authConnection: AuthConnection | undefined = undefined
    try {
      if (message.payload.payload == null) {
        throw new Error(`Payload was nullish during auth sync!`)
      }

      // get the managed community by ID and return an error if not found
      const community = await config.communitiesManager.get(
        message.payload.payload.teamId,
      )
      if (community == null) {
        throw new Error(`No community found`)
      }

      // get the existing auth connection for this user and return an error if not found
      authConnection = community.authConnections?.get(
        message.payload.payload.userId,
      )
      if (authConnection == null) {
        throw new Error(
          `No auth connection was established for this user on this community`,
        )
      }
      // push the sync message onto the auth sync connection
      authConnection.lfaConnection.deliver(
        uint8arrays.fromString(message.payload.payload.message, 'base64'),
      )
    } catch (e) {
      _logger.error(`Error while processing auth sync event`, e)
      authConnection?.lfaConnection.emit('localError', {
        message: `Error while handling auth sync`,
        type: 'SocketHandlerError',
      })
    }
  }

  // register event handlers on this socket
  config.socket.on(WebsocketEvents.GeneratePublicKeys, handleGeneratePublicKeys)
  config.socket.on(WebsocketEvents.AuthSync, handleAuthSync)
}
