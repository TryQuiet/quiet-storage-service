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
import type { PingHandlerOptions, Ping, Pong } from './types.js'

const baseLogger = createLogger('Websocket:Event:Ping')

/**
 * Adds event handlers for 'ping' and 'pong' events
 *
 * @param socketServer Socket.io server instance
 * @param socket Socket connection with client
 */
export function registerPingHandlers(options: PingHandlerOptions): void {
  const _logger = baseLogger.extend(options.socket.id)
  _logger.debug(`Initializing ping WS event handlers`)

  function handlePing(
    encryptedPayload: string,
    callback: (payload: string) => void,
  ): void {
    _logger.verbose(`Got a ping message`)
    try {
      const payload = options.encryption.decrypt(
        encryptedPayload,
        options.sessionKey,
      ) as Ping
      if (!Number.isInteger(payload.ts)) {
        const pong: Pong = {
          success: false,
          reason: 'Invalid ts',
          ts: DateTime.utc().toMillis(),
        }
        callback(options.encryption.encrypt(pong, options.sessionKey))
        return
      }

      const pong: Pong = {
        success: true,
        ts: DateTime.utc().toMillis(),
      }
      const encryptedResponse = options.encryption.encrypt(
        pong,
        options.sessionKey,
      )
      callback(encryptedResponse)
    } catch (e) {
      _logger.error(`Error while processing ping event`, e)
      let reason: string | undefined = undefined
      if (
        e instanceof EncryptionBase64Error ||
        e instanceof EncryptionError ||
        e instanceof DecryptionError
      ) {
        reason = e.message
      } else {
        reason = `Error while processing ping`
      }

      const pong: Pong = {
        success: false,
        reason,
        ts: DateTime.utc().toMillis(),
      }
      callback(options.encryption.encrypt(pong, options.sessionKey))

      _logger.warn(`Disconnecting socket due to ping failure`)
      options.socket.disconnect(true)
    }
  }

  // register event handlers
  options.socket.on(WebsocketEvents.Ping, handlePing)
}
