/**
 * NOTE: This is a dummy WS handler to establish how we'll set them up and for adding websocket tests.  Socket.io
 * has its own ping handler.
 */

import { WebsocketEvents } from '../../ws.types.js'
import { DateTime } from 'luxon'
import {
  DecryptionError,
  EncryptionBase64Error,
  EncryptionError,
} from '../../../encryption/types.js'
import { createLogger } from '../../../app/logger/nest.logger.js'
import {
  type CommunitiesHandlerOptions,
  CreateCommunityStatus,
  type CreateCommunity,
  type CreateCommunityResponse,
} from './types.js'

const baseLogger = createLogger('Websocket:Event:Communities')

/**
 * Adds event handlers for 'ping' and 'pong' events
 *
 * @param socketServer Socket.io server instance
 * @param socket Socket connection with client
 */
export function registerCommunitiesHandlers(
  options: CommunitiesHandlerOptions,
): void {
  const _logger = baseLogger.extend(options.socket.id)
  _logger.debug(`Initializing ping WS event handlers`)

  async function handleCreateCommunity(
    encryptedPayload: string,
    callback: (payload: string) => void,
  ): Promise<void> {
    try {
      const message = options.encryption.decrypt(
        encryptedPayload,
        options.sessionKey,
      ) as CreateCommunity
      _logger.log(message)
      const written = await options.storage.addCommunity(message.payload)
      let response: CreateCommunityResponse | undefined = undefined
      if (!written) {
        response = {
          ts: DateTime.utc().toMillis(),
          status: CreateCommunityStatus.Error,
          reason: 'Failed to write to storage',
        }
      } else {
        response = {
          ts: DateTime.utc().toMillis(),
          status: CreateCommunityStatus.Success,
        }
      }
      _logger.log(
        `Read community`,
        await options.storage.getCommunity(message.payload.teamId),
      )
      const encryptedResponse = options.encryption.encrypt(
        response,
        options.sessionKey,
      )
      callback(encryptedResponse)
    } catch (e) {
      _logger.error(`Error while processing create community event`, e)
      let reason: string | undefined = undefined
      if (
        e instanceof EncryptionBase64Error ||
        e instanceof EncryptionError ||
        e instanceof DecryptionError
      ) {
        reason = e.message
      } else {
        reason = `Error while creating community`
      }

      const response: CreateCommunityResponse = {
        ts: DateTime.utc().toMillis(),
        status: CreateCommunityStatus.Error,
        reason,
      }
      callback(options.encryption.encrypt(response, options.sessionKey))

      _logger.warn(`Disconnecting socket due to ping failure`)
      options.socket.disconnect(true)
    }
  }

  // register event handlers
  options.socket.on(WebsocketEvents.CreateCommunity, handleCreateCommunity)
}
