/**
 * Communities websocket event handlers
 */

import { WebsocketEvents } from '../../websocket/ws.types.js'
import { DateTime } from 'luxon'
import { createLogger } from '../../app/logger/logger.js'
import {
  type CommunitiesHandlerOptions,
  CreateCommunityStatus,
  type CreateCommunity,
  type CreateCommunityResponse,
  CommunityOperationStatus,
  type GetCommunity,
  type GetCommunityResponse,
  type CommunitySignInMessage,
} from './types/index.js'

const baseLogger = createLogger('Websocket:Event:Communities')

/**
 * Adds event handlers for community-related events
 *
 * @param options Websocket handler options
 */
export function registerCommunitiesHandlers(
  options: CommunitiesHandlerOptions,
): void {
  const _logger = baseLogger.extend(options.socket.id)
  _logger.debug(`Initializing communities WS event handlers`)

  /**
   * Create and store a community
   *
   * @param message Create community message
   * @param callback Callback for sending response
   */
  async function handleCreateCommunity(
    message: CreateCommunity,
    callback: (payload: CreateCommunityResponse) => void,
  ): Promise<void> {
    _logger.debug(`Handling community create event`)
    try {
      // Create the community and start syncing the sigchain with this user
      await options.communitiesManager.create(
        message.payload.userId,
        message.payload.community,
        message.payload.teamKeyring,
        options.socket,
      )

      // form and return a success response to the user
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

  /**
   * Start the sign in process for this user and start auth sync connection
   *
   * @param message Community sign in message
   * @param callback Callback for sending response
   */
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
      // get the community and return an error response if not found
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

      // start the auth sync connection and return a success response
      _logger.debug(
        `Found community for ID ${teamId}, initializing sync connection`,
      )
      options.communitiesManager.startAuthSyncConnection(
        userId,
        teamId,
        options,
      )

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

  /**
   * Get a community by ID and return to the user
   *
   * @param message Get community message
   * @param callback Callback for returning response
   */
  async function handleGetCommunity(
    message: GetCommunity,
    callback: (payload: GetCommunityResponse) => void,
  ): Promise<void> {
    try {
      // get the community and return a success or error response based on result
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
            payload: {
              sigChain: managedCommunity.sigChain.serialize(true),
              teamId: managedCommunity.teamId,
            },
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

  // register event handlers on this socket
  options.socket.on(WebsocketEvents.CreateCommunity, handleCreateCommunity)
  options.socket.on(WebsocketEvents.GetCommunity, handleGetCommunity)
  options.socket.on(WebsocketEvents.SignInCommunity, handleSignInToCommunity)
}
