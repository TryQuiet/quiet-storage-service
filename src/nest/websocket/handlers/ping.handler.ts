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
import { QuietNestLogger } from '../../app/logger/nest.logger.js'

const logger = new QuietNestLogger('Websocket:Event:Ping')

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
  logger.debug(`Initializing ping WS event handlers`)

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
      logger.debug(`Responding with pong`, JSON.stringify(pong))
      const encryptedResponse = encryption.encrypt(pong, sessionKey)
      callback(encryptedResponse)
    } catch (e) {
      logger.error(`Error while processing ping event`, e)
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

      logger.warn(`Disconnecting socket due to ping failure`)
      socket.disconnect(true)
    }
  }

  function handlePong(payload: Pong): void {
    logger.debug(`Got a pong`, JSON.stringify(payload))
    if (payload.success) {
      logger.debug(`Received successful pong response!`)
    } else {
      logger.error(`Ping was not successful!`)
    }
  }

  // register event handlers
  socket.on(WebsocketEvents.Ping, handlePing)
  socket.on(WebsocketEvents.Pong, handlePong)
}
