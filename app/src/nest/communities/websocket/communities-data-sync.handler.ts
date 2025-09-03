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
  DataSyncMessage,
  DataSyncResponseMessage,
} from './types/data-sync.types.js'
import {
  AuthenticationError,
  CommunityNotFoundError,
  SignatureMismatchError,
} from '../../utils/errors.js'

const baseLogger = createLogger('Websocket:Event:Communities:DataSync')

/**
 * Adds event handlers for events related to communities sync data (i.e. OrbitDB data)
 *
 * @param config Websocket handler config
 */
export function registerCommunitiesDataSyncHandlers(
  config: CommunitiesHandlerConfig,
): void {
  const _logger = baseLogger.extend(config.socket.id)
  _logger.debug(`Initializing communities data sync WS event handlers`)

  /**
   * Process an incoming data sync message and write to the DB
   *
   * @param message Data sync message
   * @param callback Callback for sending response
   */
  async function handleDataSync(
    message: DataSyncMessage,
    callback: (payload: DataSyncResponseMessage) => void,
  ): Promise<void> {
    _logger.debug(`Handling community data sync message`)
    try {
      // Check that the user has authenticated on this community and then write to the DB
      const success =
        await config.communitiesManager.processIncomingSyncMessage(
          message.payload,
        )

      if (!success) {
        throw new Error('Failed to write data sync message to the DB')
      }

      // form and return a success response to the user
      let response: DataSyncResponseMessage | undefined = undefined
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
      _logger.error(`Error while processing community data sync event`, e)
      let reason = `Error while handling data sync message`
      if (
        e instanceof SignatureMismatchError ||
        e instanceof AuthenticationError ||
        e instanceof CommunityNotFoundError
      ) {
        reason = e.message
      }

      const errorResponse: DataSyncResponseMessage = {
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
  config.socket.on(WebsocketEvents.DataSync, handleDataSync)
}
