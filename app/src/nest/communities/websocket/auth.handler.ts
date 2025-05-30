/**
 * NOTE: This is a dummy WS handler to establish how we'll set them up and for adding websocket tests.  Socket.io
 * has its own ping handler.
 */

import { WebsocketEvents } from '../../websocket/ws.types.js'
import { DateTime } from 'luxon'
import { createLogger } from '../../app/logger/logger.js'
import {
  type AuthSyncMessage,
  CommunityOperationStatus,
  type GeneratePublicKeysMessage,
  type GeneratePublicKeysResponse,
  type CommunitiesHandlerOptions,
} from './types/index.js'
import * as uint8arrays from 'uint8arrays'
import type { AuthConnection } from '../auth/auth.connection.js'
import { type Keyset, redactKeys } from '@localfirst/crdx'
import { AllowedServerKeyState } from '../types.js'

const baseLogger = createLogger('Websocket:Event:Communities:Auth')

/**
 * Adds event handlers for community-related events
 *
 * @param socketServer Socket.io server instance
 * @param socket Socket connection with client
 */
export function registerCommunitiesAuthHandlers(
  options: CommunitiesHandlerOptions,
): void {
  const _logger = baseLogger.extend(options.socket.id)
  _logger.debug(`Initializing communities auth WS event handlers`)

  async function handleGeneratePublicKeys(
    message: GeneratePublicKeysMessage,
    callback: (payload: GeneratePublicKeysResponse) => void,
  ): Promise<void> {
    try {
      const keysetWithSecrets = await options.communitiesManager.getServerKeys(
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

  async function handleAuthSync(message: AuthSyncMessage): Promise<void> {
    let authConnection: AuthConnection | undefined = undefined
    try {
      if (message.payload.payload == null) {
        throw new Error(`Payload was nullish during auth sync!`)
      }

      const community = await options.communitiesManager.get(
        message.payload.payload.teamId,
      )
      if (community == null) {
        throw new Error(`No community found`)
      }

      authConnection = community.authConnections?.get(
        message.payload.payload.userId,
      )
      if (authConnection == null) {
        throw new Error(
          `No auth connection was established for this user on this community`,
        )
      }
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

  // register event handlers
  options.socket.on(
    WebsocketEvents.GeneratePublicKeys,
    handleGeneratePublicKeys,
  )
  options.socket.on(WebsocketEvents.AuthSync, handleAuthSync)
}
