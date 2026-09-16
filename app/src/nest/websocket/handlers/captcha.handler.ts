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
import { createHash } from 'node:crypto'

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
      const { token } = message.payload
      if (typeof token !== 'string' || token.length === 0) {
        throw new Error('Missing captcha token')
      }
      const tokenHash = createHash('sha256').update(token).digest('hex')
      if (
        config.socket.data.verifiedCaptcha === true &&
        config.socket.data.verifiedCaptchaTokenHash === tokenHash
      ) {
        // Replaying the acknowledgement for an already verified token must never
        // renew a consumed grant. A different token must pass real verification.
        const response: CaptchaVerifyResponse = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.SUCCESS,
        }
        callback(response)
        return
      }
      const { captchaVerification: pending } = config.socket.data
      if (pending != null) {
        callback(
          pending.tokenHash === tokenHash
            ? await pending.response
            : {
                ts: DateTime.utc().toMillis(),
                status: CommunityOperationStatus.ERROR,
                reason: 'Captcha verification already in progress',
              },
        )
        return
      }
      const verification = {
        tokenHash,
        response: Promise.resolve().then(
          async (): Promise<CaptchaVerifyResponse> => {
            const hcaptchaResponse =
              await config.captchaService.verifyToken(token)
            if (hcaptchaResponse.success) {
              config.socket.data.verifiedCaptcha = true
              config.socket.data.verifiedCaptchaTokenHash = tokenHash
              config.socket.data.usedCaptchaForKeys = false
              config.socket.data.captchaKeyGrant = undefined
              config.socket.data.usedCaptchaForCreateCommunity = false
              return {
                ts: DateTime.utc().toMillis(),
                status: CommunityOperationStatus.SUCCESS,
              }
            }
            return {
              ts: DateTime.utc().toMillis(),
              status: CommunityOperationStatus.ERROR,
              reason: hcaptchaResponse['error-codes']?.join(', '),
            }
          },
        ),
      }
      config.socket.data.captchaVerification = verification
      try {
        callback(await verification.response)
      } finally {
        if (config.socket.data.captchaVerification === verification) {
          config.socket.data.captchaVerification = undefined
        }
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
