/**
 * NOTE: This is a dummy WS handler to establish how we'll set them up and for adding websocket tests.  Socket.io
 * has its own ping handler.
 */

import { WebsocketEvents } from '../../websocket/ws.types.js'
import { DateTime } from 'luxon'
import {
  DecryptionError,
  EncryptionBase64Error,
  EncryptionError,
} from '../../encryption/types.js'
import { createLogger } from '../../app/logger/logger.js'
import {
  type CommunitiesHandlerOptions,
  CreateCommunityStatus,
  type CreateCommunity,
  type CreateCommunityResponse,
  type UpdateCommunity,
  type UpdateCommunityResponse,
  CommunityOperationStatus,
  type GetCommunity,
  type GetCommunityResponse,
} from './types.js'

const baseLogger = createLogger('Websocket:Event:Communities')

/**
 * Adds event handlers for community-related events
 *
 * @param socketServer Socket.io server instance
 * @param socket Socket connection with client
 */
export function registerCommunitiesHandlers(
  options: CommunitiesHandlerOptions,
): void {
  const _logger = baseLogger.extend(options.socket.id)
  _logger.debug(`Initializing communities WS event handlers`)

  async function handleCreateCommunity(
    encryptedPayload: string,
    callback: (payload: string) => void,
  ): Promise<void> {
    _logger.debug(`Handling community create event`)
    try {
      const message = options.encryption.decrypt(
        encryptedPayload,
        options.sessionKey,
        true,
      ) as CreateCommunity
      await options.communitiesManager.create(
        message.payload.community,
        message.payload.teamKeyring,
        options,
      )
      let response: CreateCommunityResponse | undefined = undefined
      response = {
        ts: DateTime.utc().toMillis(),
        payload: {
          status: CreateCommunityStatus.Success,
        },
      }
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
        payload: {
          status: CreateCommunityStatus.Error,
          reason,
        },
      }
      callback(options.encryption.encrypt(response, options.sessionKey))
    }
  }

  async function handleUpdateCommunity(
    encryptedPayload: string,
    callback: (payload: string) => void,
  ): Promise<void> {
    try {
      const message = options.encryption.decrypt(
        encryptedPayload,
        options.sessionKey,
        true,
      ) as UpdateCommunity
      const written = await options.storage.updateCommunity(
        message.payload.teamId,
        message.payload.updates,
      )
      let response: UpdateCommunityResponse | undefined = undefined
      if (!written) {
        response = {
          ts: DateTime.utc().toMillis(),
          payload: {
            status: CommunityOperationStatus.Error,
            reason: 'Failed to write to storage',
          },
        }
      } else {
        response = {
          ts: DateTime.utc().toMillis(),
          payload: {
            status: CommunityOperationStatus.Success,
          },
        }
      }
      const encryptedResponse = options.encryption.encrypt(
        response,
        options.sessionKey,
      )
      callback(encryptedResponse)
    } catch (e) {
      _logger.error(`Error while processing update community event`, e)
      let reason: string | undefined = undefined
      if (
        e instanceof EncryptionBase64Error ||
        e instanceof EncryptionError ||
        e instanceof DecryptionError
      ) {
        reason = e.message
      } else {
        reason = `Error while updating community`
      }

      const response: UpdateCommunityResponse = {
        ts: DateTime.utc().toMillis(),
        payload: {
          status: CommunityOperationStatus.Error,
          reason,
        },
      }
      callback(options.encryption.encrypt(response, options.sessionKey))
    }
  }

  async function handleGetCommunity(
    encryptedPayload: string,
    callback: (payload: string) => void,
  ): Promise<void> {
    try {
      const message = options.encryption.decrypt(
        encryptedPayload,
        options.sessionKey,
        true,
      ) as GetCommunity
      const community = await options.storage.getCommunity(message.payload.id)
      let response: GetCommunityResponse | undefined = undefined
      if (community == null) {
        response = {
          ts: DateTime.utc().toMillis(),
          payload: {
            status: CommunityOperationStatus.NotFound,
            reason: 'No community found in storage',
          },
        }
      } else {
        response = {
          ts: DateTime.utc().toMillis(),
          payload: {
            status: CommunityOperationStatus.Success,
            payload: community,
          },
        }
      }
      const encryptedResponse = options.encryption.encrypt(
        response,
        options.sessionKey,
      )
      callback(encryptedResponse)
    } catch (e) {
      _logger.error(`Error while processing update community event`, e)
      let reason: string | undefined = undefined
      if (
        e instanceof EncryptionBase64Error ||
        e instanceof EncryptionError ||
        e instanceof DecryptionError
      ) {
        reason = e.message
      } else {
        reason = `Error while getting community`
      }

      const response: GetCommunityResponse = {
        ts: DateTime.utc().toMillis(),
        payload: {
          status: CommunityOperationStatus.Error,
          reason,
        },
      }
      callback(options.encryption.encrypt(response, options.sessionKey))
    }
  }

  // register event handlers
  options.socket.on(WebsocketEvents.CreateCommunity, handleCreateCommunity)
  options.socket.on(WebsocketEvents.UpdateCommunity, handleUpdateCommunity)
  options.socket.on(WebsocketEvents.GetCommunity, handleGetCommunity)
}
