/**
 * Communities websocket event handlers
 */

import { WebsocketEvents } from '../ws.types.js'
import { createLogger } from '../../app/logger/logger.js'
import {
  CommunityOperationStatus,
  type CaptchaHandlerConfig,
} from './types/common.types.js'
import type {
  CaptchaVerifyMessage,
  CaptchaVerifyResponse,
  GetCaptchaSiteKeyMessage,
  GetCaptchaSiteKeyResponse,
} from './types/captcha.types.js'
import { DateTime } from 'luxon'
import { registerAcknowledgedEvent } from './safe-event-handler.js'

const baseLogger = createLogger('Websocket:Event:Captcha')

/**
 * Adds event handlers for captcha-related events
 *
 * @param config Websocket handler config
 */
export function registerCaptchaHandlers(config: CaptchaHandlerConfig): void {
  const _logger = baseLogger.extend(config.socket.id)
  _logger.debug(`Initializing captcha WS event handlers`)
  /**
   * Verify captcha token
   *
   * @param message Verify captcha message
   * @param callback Callback for sending response
   */
  async function handleVerifyCaptcha(
    message: CaptchaVerifyMessage,
    callback: (response: CaptchaVerifyResponse) => void,
  ): Promise<void> {
    try {
      if (config.socket.data.verifiedCaptcha === true) {
        const response: CaptchaVerifyResponse = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.SUCCESS,
        }
        callback(response)
        return
      }
      const hcaptchaResponse = await config.captchaService.verifyToken(
        message.payload.token,
      )
      if (hcaptchaResponse.success) {
        config.socket.data.verifiedCaptcha = true
        config.socket.data.usedCaptchaForKeys = false
        config.socket.data.usedCaptchaForCreateCommunity = false
        const response: CaptchaVerifyResponse = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.SUCCESS,
        }
        callback(response)
      } else {
        const response: CaptchaVerifyResponse = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.ERROR,
          reason: hcaptchaResponse['error-codes']?.join(', '),
        }
        callback(response)
      }
    } catch (error) {
      const response: CaptchaVerifyResponse = {
        ts: DateTime.utc().toMillis(),
        status: CommunityOperationStatus.ERROR,
        reason: 'Captcha verification failed',
      }
      callback(response)
    }
  }

  function handleGetCaptchaSiteKey(
    message: GetCaptchaSiteKeyMessage,
    callback: (response: GetCaptchaSiteKeyResponse) => void,
  ): void {
    try {
      const siteKey = config.captchaService.getSiteKey()
      const response: GetCaptchaSiteKeyResponse = {
        ts: DateTime.utc().toMillis(),
        status: CommunityOperationStatus.SUCCESS,
        payload: {
          siteKey,
        },
      }
      callback(response)
    } catch (error) {
      _logger.error('Error getting captcha site key', error)
      const response: GetCaptchaSiteKeyResponse = {
        ts: DateTime.utc().toMillis(),
        status: CommunityOperationStatus.ERROR,
        reason: 'Failed to get captcha site key',
      }
      callback(response)
    }
  }

  // register event handlers on this socket
  registerAcknowledgedEvent(
    config.socket,
    WebsocketEvents.VerifyCaptcha,
    handleVerifyCaptcha,
    _logger,
    { requiresPayload: true },
  )
  registerAcknowledgedEvent(
    config.socket,
    WebsocketEvents.GetCaptchaSiteKey,
    handleGetCaptchaSiteKey,
    _logger,
  )
}
