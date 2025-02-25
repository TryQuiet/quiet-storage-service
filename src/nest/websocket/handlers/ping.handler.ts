/**
 * NOTE: This is a dummy WS handler to establish how we'll set them up and for adding websocket tests.  Socket.io
 * has its own ping handler.
 */

import { Logger } from '@nestjs/common'
import type { Server, Socket } from 'socket.io'
import { WebsocketEvents } from '../ws.types.js'
import type { Ping, Pong } from './types.js'
import { DateTime } from 'luxon'
import type { CryptoKX } from 'libsodium-wrappers-sumo'
import type { WebsocketEncryptionService } from '../../encryption/ws.enc.service.js'

const logger = new Logger('Websocket:Event:Ping')

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
    const payload = encryption.decrypt(encryptedPayload, sessionKey) as Ping
    logger.debug(`Got a ping`, payload)
    const pong: Pong = {
      success: true,
      ts: DateTime.utc().toMillis(),
    }
    logger.debug(`Responding with pong`, JSON.stringify(pong))
    const encryptedResponse = encryption.encrypt(pong, sessionKey)
    callback(encryptedResponse)
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
