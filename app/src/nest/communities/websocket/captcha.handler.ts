/**
 * Communities websocket event handlers
 */

import { WebsocketEvents } from '../../websocket/ws.types.js'
import { createLogger } from '../../app/logger/logger.js'
import { verifyHCaptchaToken } from '../../utils/captcha.js'
import { CommunityOperationStatus, type CommunitiesHandlerConfig } from './types/common.types.js'
import type {
  CaptchaVerifyMessage,
  CaptchaVerifyResponse,
  GetCaptchaSiteKeyMessage,
  GetCaptchaSiteKeyResponse,
} from './types/captcha.types.js'
import { DateTime } from 'luxon'
import { ConfigService } from '../../utils/config/config.service.js'

const baseLogger = createLogger('Websocket:Event:Communities')

/**
 * Adds event handlers for community-related events
 *
 * @param config Websocket handler config
 */
export function registerCaptchaHandlers(config: CommunitiesHandlerConfig): void {
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
    callback: (response: CaptchaVerifyResponse) => void
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
      const hcaptchaResponse = await verifyHCaptchaToken(message.payload.token)
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
    callback: (response: GetCaptchaSiteKeyResponse) => void
  ): void {
    try {
      const siteKey = ConfigService.getString('HCAPTCHA_SITE_KEY')
      if (siteKey == null) {
        throw new Error('hCaptcha site key not configured')
      }
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
  config.socket.on(WebsocketEvents.VerifyCaptcha, handleVerifyCaptcha)
  config.socket.on(WebsocketEvents.GetCaptchaSiteKey, handleGetCaptchaSiteKey)
}
