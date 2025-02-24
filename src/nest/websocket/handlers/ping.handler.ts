import { Logger } from '@nestjs/common'
import type { Server, Socket } from 'socket.io'
import { WebsocketEvents } from '../ws.types.js'
import type { Pong } from './types.js'
import { DateTime } from 'luxon'

const logger = new Logger('Websocket:Event:Ping')

export function registerPingHandlers(
  socketServer: Server,
  socket: Socket,
): void {
  logger.log(`Initializing ping WS event handlers`)

  function handlePing(): void {
    socket.emit(WebsocketEvents.PONG, {
      success: true,
      ts: DateTime.utc().toMillis(),
    })
  }

  function handlePong(payload: Pong): void {
    if (payload.success) {
      logger.log(`Received successful pong response!`)
    } else {
      logger.error(`Ping was not successful!`)
    }
  }

  // register event handlers
  socket.on(WebsocketEvents.PING, handlePing)
  socket.on(WebsocketEvents.PONG, handlePong)
}
