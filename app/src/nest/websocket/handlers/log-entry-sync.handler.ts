/**
 * Communities data sync websocket event handlers
 */

import { WebsocketEvents } from '../ws.types.js'
import { DateTime } from 'luxon'
import { createLogger } from '../../app/logger/logger.js'
import {
  CommunityOperationStatus,
  type LogEntrySyncHandlerConfig,
} from './types/index.js'
import type {
  LogEntryPullMessage,
  LogEntryPullResponseMessage,
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
  config: LogEntrySyncHandlerConfig,
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
        await config.syncManager.processIncomingLogEntrySyncMessage(
          message.payload,
          config.socket,
        )

      if (!success) {
        throw new Error('Failed to write log entry sync message to the DB')
      }

      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions -- testing
      config.socketServer
        .to(message.payload.teamId)
        .except(config.socket.id)
        .emit(WebsocketEvents.LogEntrySync, message)

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
        const { message: errorMessage } = e
        reason = errorMessage
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

  async function handleLogEntryPull(
    message: LogEntryPullMessage,
    callback: (payload: LogEntryPullResponseMessage) => void,
  ): Promise<void> {
    _logger.debug(`Handling community log entry pull message`)
    try {
      const result = await config.syncManager.getPaginatedLogEntries(
        message.payload,
        config.socket,
      )

      const response: LogEntryPullResponseMessage = {
        ts: DateTime.utc().toMillis(),
        status: CommunityOperationStatus.SUCCESS,
        payload: { ...result },
      }
      callback(response)
    } catch (e) {
      _logger.error(`Error while processing log entry pull event`, e)
      let reason = `Error while handling log entry pull message`
      if (
        e instanceof AuthenticationError ||
        e instanceof CommunityNotFoundError
      ) {
        const { message: errorMessage } = e
        reason = errorMessage
      }

      const errorResponse: LogEntryPullResponseMessage = {
        ts: DateTime.utc().toMillis(),
        status: CommunityOperationStatus.ERROR,
        reason,
        payload: { entries: [], hasNextPage: false },
      }
      callback(errorResponse)
    }
  }

  // register event handlers on this socket
  config.socket.on(WebsocketEvents.LogEntrySync, handleLogEntrySync)
  config.socket.on(WebsocketEvents.LogEntryPull, handleLogEntryPull)
}
