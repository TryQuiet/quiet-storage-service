/**
 * Communities data sync websocket event handlers
 */

import { WebsocketEvents } from '../../websocket/ws.types.js'
import { DateTime } from 'luxon'
import { createLogger } from '../../app/logger/logger.js'
import {
  type CommunitiesHandlerConfig,
  CommunityOperationStatus,
} from './types/index.js'
import type {
  LogEntrySyncMessage,
  LogEntrySyncResponseMessage,
} from './types/log-entry-sync.types.js'
import {
  AuthenticationError,
  CommunityNotFoundError,
  SignatureMismatchError,
} from '../../utils/errors.js'

const baseLogger = createLogger('Websocket:Event:Communities:LogEntrySync')

/**
 * Adds event handlers for events related to communities log sync data (i.e. OrbitDB data)
 *
 * @param config Websocket handler config
 */
export function registerLogEntrySyncHandlers(
  config: CommunitiesHandlerConfig,
): void {
  const _logger = baseLogger.extend(config.socket.id)
  _logger.debug(`Initializing communities log entry sync WS event handlers`)

  /**
   * Process an incoming log entry sync message and write to the DB
   *
   * @param message Log entry sync message
   * @param callback Callback for sending response
   */
  async function handleLogEntrySync(
    message: LogEntrySyncMessage,
    callback: (payload: LogEntrySyncResponseMessage) => void,
  ): Promise<void> {
    _logger.debug(`Handling community log entry sync message`)
    try {
      // Check that the user has authenticated on this community and then write to the DB
      const success =
        await config.communitiesManager.processIncomingLogEntrySyncMessage(
          message.payload,
        )

      if (!success) {
        throw new Error('Failed to write log entry sync message to the DB')
      }

      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- testing
      _logger.debug(`Rooms before fanout: ${Array.from(config.socket.rooms)}`)
      config.socketServer
        .to(message.payload.teamId)
        .except(config.socket.id)
        .emit(WebsocketEvents.LogEntryFanout, message)

      // form and return a success response to the user
      let response: LogEntrySyncResponseMessage | undefined = undefined
      response = {
        ts: DateTime.utc().toMillis(),
        status: CommunityOperationStatus.SUCCESS,
        payload: {
          hash: message.payload.hash,
          hashedDbId: message.payload.hashedDbId,
          teamId: message.payload.teamId,
        },
      }
      callback(response)
    } catch (e) {
      _logger.error(`Error while processing log entry data sync event`, e)
      let reason = `Error while handling log entry sync message`
      if (
        e instanceof SignatureMismatchError ||
        e instanceof AuthenticationError ||
        e instanceof CommunityNotFoundError
      ) {
        reason = e.message
      }

      const errorResponse: LogEntrySyncResponseMessage = {
        ts: DateTime.utc().toMillis(),
        status: CommunityOperationStatus.ERROR,
        reason,
        payload: {
          hash: message.payload.hash,
          hashedDbId: message.payload.hashedDbId,
          teamId: message.payload.teamId,
        },
      }
      callback(errorResponse)
    }
  }

  // register event handlers on this socket
  config.socket.on(WebsocketEvents.LogEntrySync, handleLogEntrySync)
}
