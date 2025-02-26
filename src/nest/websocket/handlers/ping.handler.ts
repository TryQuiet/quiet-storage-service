/**
 * NOTE: This is a dummy WS handler to establish how we'll set them up and for adding websocket tests.  Socket.io
 * has its own ping handler.
 */

import type { Server, Socket } from 'socket.io'
import { WebsocketEvents } from '../ws.types.js'
import type { Ping, Pong } from './types.js'
import { DateTime } from 'luxon'
import type { CryptoKX } from 'libsodium-wrappers-sumo'
import type { WebsocketEncryptionService } from '../../encryption/ws.enc.service.js'
import {
  DecryptionError,
  EncryptionBase64Error,
  EncryptionError,
} from '../../encryption/types.js'
import { createLogger } from '../../app/logger/nest.logger.js'

const baseLogger = createLogger('Websocket:Event:Ping')

/**
 * Adds event handlers for 'ping' and 'pong' events
 *
 * @param socketServer Socket.io server instance
 * @param socket Socket connection with client
 */
export function registerPingHandlers(
  socketServer: Server,
  socket: Socket,
  sessionKey: CryptoKX,
  encryption: WebsocketEncryptionService,
): void {
  const _logger = baseLogger.extend(socket.id)
  _logger.debug(`Initializing ping WS event handlers`)

  function handlePing(
    encryptedPayload: string,
    callback: (payload: string) => void,
  ): void {
    try {
      const payload = encryption.decrypt(encryptedPayload, sessionKey) as Ping
      if (!Number.isInteger(payload.ts)) {
        const pong: Pong = {
          success: false,
          reason: 'Invalid ts',
          ts: DateTime.utc().toMillis(),
        }
        callback(encryption.encrypt(pong, sessionKey))
        return
      }

      const pong: Pong = {
        success: true,
        ts: DateTime.utc().toMillis(),
      }
      const encryptedResponse = encryption.encrypt(pong, sessionKey)
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
      callback(encryption.encrypt(pong, sessionKey))

      _logger.warn(`Disconnecting socket due to ping failure`)
      socket.disconnect(true)
    }
  }

  // register event handlers
  socket.on(WebsocketEvents.Ping, handlePing)
}
