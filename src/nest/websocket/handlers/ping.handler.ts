import { Logger } from '@nestjs/common'
import type { Server, Socket } from 'socket.io'
import { WebsocketEvents } from '../ws.types.js'
import type { Ping, Pong } from './types.js'
import { DateTime } from 'luxon'
import type { WsResponse } from '@nestjs/websockets'

const logger = new Logger('Websocket:Event:Ping')

export function registerPingHandlers(
  socketServer: Server,
  socket: Socket,
): void {
  logger.log(`Initializing ping WS event handlers`)

  function handlePing(
    payload: Ping,
    callback: (payload: WsResponse<Pong>) => void,
  ): void {
    logger.debug(`Got a ping`, JSON.stringify(payload))
    const pong: Pong = {
      success: true,
      ts: DateTime.utc().toMillis(),
    }
    logger.debug(`Responding with pong`, JSON.stringify(pong))
    callback({
      event: WebsocketEvents.PONG,
      data: pong,
    })
  }

  function handlePong(payload: Pong): void {
    logger.debug(`Got a pong`, JSON.stringify(payload))
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
