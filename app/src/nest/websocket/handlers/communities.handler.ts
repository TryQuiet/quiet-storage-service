/**
 * Communities websocket event handlers
 */

import { WebsocketEvents } from '../ws.types.js'
import { DateTime } from 'luxon'
import { createLogger } from '../../app/logger/logger.js'
import {
  type CommunitiesHandlerConfig,
  CreateCommunityStatus,
  type CreateCommunity,
  type CreateCommunityResponse,
  CommunityOperationStatus,
  type GetCommunity,
  type GetCommunityResponse,
  type CommunitySignInMessage,
} from './types/index.js'
import { Environment } from '../../utils/config/types.js'
import { ConfigService } from '../../utils/config/config.service.js'
import {
  AuthenticationError,
  CommunityNotFoundError,
} from '../../utils/errors.js'
import { CaptchaErrorMessages } from './types/captcha.types.js'

const baseLogger = createLogger('Websocket:Event:Communities')

/**
 * Adds event handlers for community-related events
 *
 * @param config Websocket handler config
 */
export function registerCommunitiesHandlers(
  config: CommunitiesHandlerConfig,
): void {
  const _logger = baseLogger.extend(config.socket.id)
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
      if (config.socket.data.verifiedCaptcha !== true) {
        _logger.warn(
          `Attempted to create community without passing captcha verification`,
        )
        const errorResponse: CreateCommunityResponse = {
          ts: DateTime.utc().toMillis(),
          status: CreateCommunityStatus.ERROR,
          reason: CaptchaErrorMessages.CAPTCHA_VERIFICATION_REQUIRED,
        }
        callback(errorResponse)
        return
      }
      if (config.socket.data.usedCaptchaForCreateCommunity === true) {
        const errorResponse: CreateCommunityResponse = {
          ts: DateTime.utc().toMillis(),
          status: CreateCommunityStatus.ERROR,
          reason: CaptchaErrorMessages.CAPTCHA_VERIFICATION_REQUIRED,
        }
        callback(errorResponse)
        return
      }
      // Create the community and start syncing the sigchain with this user
      await config.communitiesManager.create(
        message.payload.userId,
        message.payload.community,
        message.payload.teamKeyring,
        config.socket,
      )
      config.socket.data.usedCaptchaForCreateCommunity = true

      await config.socket.join(message.payload.community.teamId)

      // form and return a success response to the user
      let response: CreateCommunityResponse | undefined = undefined
      response = {
        ts: DateTime.utc().toMillis(),
        status: CreateCommunityStatus.SUCCESS,
      }
      callback(response)
    } catch (e) {
      _logger.error(`Error while processing create community event`, e)
      const errorResponse: CreateCommunityResponse = {
        ts: DateTime.utc().toMillis(),
        status: CreateCommunityStatus.ERROR,
        reason: `Error while creating community`,
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
      if (message.payload == null) {
        throw new Error(`Payload was nullish!`)
      }
      const { teamId, userId } = message.payload
      // get the community and return an error response if not found
      if ((await config.communitiesManager.get(teamId)) == null) {
        _logger.warn(
          `Attempted sign-in to community ${teamId} but no community was initialized for that ID`,
        )
        const notFoundResponse: CommunitySignInMessage = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.NOT_FOUND,
          reason: `No community found for ${teamId}`,
        }
        callback(notFoundResponse)
        return
      }

      // start the auth sync connection and return a success response
      _logger.debug(
        `Found community for ID ${teamId}, initializing sync connection`,
      )
      config.communitiesManager.startAuthSyncConnection(userId, teamId, config)

      const response: CommunitySignInMessage = {
        ts: DateTime.utc().toMillis(),
        status: CommunityOperationStatus.SUCCESS,
      }
      callback(response)
    } catch (e) {
      _logger.error(`Error while processing community sign-in event`, e)
      let reason = `Error while signing in to community`
      if (
        e instanceof AuthenticationError ||
        e instanceof CommunityNotFoundError
      ) {
        reason = e.message
      }
      const errorResponse: CommunitySignInMessage = {
        ts: DateTime.utc().toMillis(),
        status: CommunityOperationStatus.ERROR,
        reason,
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
    if (ConfigService.getEnv() !== Environment.Local) {
      return
    }

    try {
      // get the community and return a success or error response based on result
      const managedCommunity = await config.communitiesManager.get(
        message.payload.id,
      )
      let response: GetCommunityResponse | undefined = undefined
      if (managedCommunity == null) {
        response = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.NOT_FOUND,
          reason: 'No community found in storage',
        }
      } else {
        response = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.SUCCESS,
          payload: {
            sigChain: managedCommunity.sigChain.serialize(true),
            teamId: managedCommunity.teamId,
          },
        }
      }
      callback(response)
    } catch (e) {
      _logger.error(`Error while processing update community event`, e)
      let reason = `Error while getting community`
      if (
        e instanceof AuthenticationError ||
        e instanceof CommunityNotFoundError
      ) {
        reason = e.message
      }
      const errorResponse: GetCommunityResponse = {
        ts: DateTime.utc().toMillis(),
        status: CommunityOperationStatus.ERROR,
        reason,
      }
      callback(errorResponse)
    }
  }

  // register event handlers on this socket
  config.socket.on(WebsocketEvents.CreateCommunity, handleCreateCommunity)
  config.socket.on(WebsocketEvents.GetCommunity, handleGetCommunity)
  config.socket.on(WebsocketEvents.SignInCommunity, handleSignInToCommunity)
}
