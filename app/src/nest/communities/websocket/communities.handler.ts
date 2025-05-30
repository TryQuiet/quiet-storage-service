/**
 * NOTE: This is a dummy WS handler to establish how we'll set them up and for adding websocket tests.  Socket.io
 * has its own ping handler.
 */

import { WebsocketEvents } from '../../websocket/ws.types.js'
import { DateTime } from 'luxon'
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
  type CommunitySignInMessage,
} from './types/index.js'

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
    message: CreateCommunity,
    callback: (payload: CreateCommunityResponse) => void,
  ): Promise<void> {
    _logger.debug(`Handling community create event`)
    try {
      await options.communitiesManager.create(
        message.payload.userId,
        message.payload.community,
        message.payload.teamKeyring,
        options,
      )
      let response: CreateCommunityResponse | undefined = undefined
      response = {
        ts: DateTime.utc().toMillis(),
        payload: {
          status: CreateCommunityStatus.SUCCESS,
        },
      }
      callback(response)
    } catch (e) {
      _logger.error(`Error while processing create community event`, e)
      const errorResponse: CreateCommunityResponse = {
        ts: DateTime.utc().toMillis(),
        payload: {
          status: CreateCommunityStatus.ERROR,
          reason: `Error while creating community`,
        },
      }
      callback(errorResponse)
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- this is fine
  async function handleSignInToCommunity(
    message: CommunitySignInMessage,
    callback: (payload: CommunitySignInMessage) => void,
  ): Promise<void> {
    _logger.debug(`Handling community sign-in event`)
    try {
      if (message.payload.payload == null) {
        throw new Error(`Payload was nullish!`)
      }
      const { teamId, userId } = message.payload.payload
      if ((await options.communitiesManager.get(teamId)) == null) {
        _logger.warn(
          `Attempted sign-in to community ${teamId} but no community was initialized for that ID`,
        )
        const notFoundResponse: CommunitySignInMessage = {
          ts: DateTime.utc().toMillis(),
          payload: {
            status: CommunityOperationStatus.NOT_FOUND,
            reason: `No community found for ${teamId}`,
          },
        }
        callback(notFoundResponse)
        return
      }

      _logger.debug(
        `Found community for ID ${teamId}, initializing sync connection`,
      )
      options.communitiesManager.startConnection(userId, teamId, options)

      const response: CommunitySignInMessage = {
        ts: DateTime.utc().toMillis(),
        payload: {
          status: CommunityOperationStatus.SUCCESS,
        },
      }
      callback(response)
    } catch (e) {
      _logger.error(`Error while processing community sign-in event`, e)
      const errorResponse: CommunitySignInMessage = {
        ts: DateTime.utc().toMillis(),
        payload: {
          status: CommunityOperationStatus.ERROR,
          reason: `Error while signing in to community`,
        },
      }
      callback(errorResponse)
    }
  }

  async function handleUpdateCommunity(
    message: UpdateCommunity,
    callback: (payload: UpdateCommunityResponse) => void,
  ): Promise<void> {
    try {
      await options.communitiesManager.update(
        message.payload.teamId,
        message.payload.updates,
      )
      const response: UpdateCommunityResponse = {
        ts: DateTime.utc().toMillis(),
        payload: {
          status: CommunityOperationStatus.SUCCESS,
        },
      }
      callback(response)
    } catch (e) {
      _logger.error(`Error while processing update community event`, e)
      const errorResponse: UpdateCommunityResponse = {
        ts: DateTime.utc().toMillis(),
        payload: {
          status: CommunityOperationStatus.ERROR,
          reason: `Error while updating community`,
        },
      }
      callback(errorResponse)
    }
  }

  async function handleGetCommunity(
    message: GetCommunity,
    callback: (payload: GetCommunityResponse) => void,
  ): Promise<void> {
    try {
      const managedCommunity = await options.communitiesManager.get(
        message.payload.id,
      )
      let response: GetCommunityResponse | undefined = undefined
      if (managedCommunity == null) {
        response = {
          ts: DateTime.utc().toMillis(),
          payload: {
            status: CommunityOperationStatus.NOT_FOUND,
            reason: 'No community found in storage',
          },
        }
      } else {
        response = {
          ts: DateTime.utc().toMillis(),
          payload: {
            status: CommunityOperationStatus.SUCCESS,
            payload: managedCommunity.community,
          },
        }
      }
      callback(response)
    } catch (e) {
      _logger.error(`Error while processing update community event`, e)
      const errorResponse: GetCommunityResponse = {
        ts: DateTime.utc().toMillis(),
        payload: {
          status: CommunityOperationStatus.ERROR,
          reason: `Error while getting community`,
        },
      }
      callback(errorResponse)
    }
  }

  // register event handlers
  options.socket.on(WebsocketEvents.CreateCommunity, handleCreateCommunity)
  options.socket.on(WebsocketEvents.UpdateCommunity, handleUpdateCommunity)
  options.socket.on(WebsocketEvents.GetCommunity, handleGetCommunity)
  options.socket.on(WebsocketEvents.SignInCommunity, handleSignInToCommunity)
}
