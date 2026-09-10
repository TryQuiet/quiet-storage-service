/**
 * Auth websocket event handlers
 */

import { WebsocketEvents, type CaptchaKeyGrant } from '../ws.types.js'
import { DateTime } from 'luxon'
import { createLogger } from '../../app/logger/logger.js'
import {
  type AuthSyncMessage,
  CommunityOperationStatus,
  type GeneratePublicKeysMessage,
  type CommunitiesHandlerConfig,
} from './types/index.js'
import * as uint8arrays from 'uint8arrays'
import type { AuthConnection } from '../../communities/auth/auth.connection.js'
import { type Keyset, redactKeys } from '@localfirst/crdx'
import { AllowedServerKeyState } from '../../communities/types.js'
import { CaptchaErrorMessages } from './types/captcha.types.js'
import {
  registerAcknowledgedEvent,
  registerFireAndForgetEvent,
} from './safe-event-handler.js'

const baseLogger = createLogger('Websocket:Event:Communities:Auth')

// Mirrors AUTH_SYNC_LARGE_MESSAGE_BYTES on the send side. Flag any inbound
// auth-sync payload large enough to be worth investigating.
const AUTH_SYNC_LARGE_PAYLOAD_BYTES = 512 * 1024

/**
 * Adds event handlers for auth-related events
 *
 * @param config Websocket handler config
 */
export function registerCommunitiesAuthHandlers(
  config: CommunitiesHandlerConfig,
): void {
  const _logger = baseLogger.extend(config.socket.id)
  _logger.debug(`Initializing communities auth WS event handlers`)

  /**
   * Generate new server keys for this community and return redacted keys to the user
   *
   * @param message Public key generation message
   * @param callback Callback for returning response
   */
  async function handleGeneratePublicKeys(
    message: GeneratePublicKeysMessage,
    callback: (payload: GeneratePublicKeysMessage) => void,
  ): Promise<void> {
    try {
      if (message.payload == null) {
        throw new Error('Payload missing from generate public keys message')
      }
      const { payload } = message
      const { teamId } = payload
      if (typeof teamId !== 'string' || teamId.length === 0) {
        throw new Error('Team ID missing from generate public keys message')
      }

      if (config.socket.data.verifiedCaptcha !== true) {
        _logger.warn(
          `Attempted to generate public keys without passing captcha verification`,
        )
        const errorResponse: GeneratePublicKeysMessage = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.ERROR,
          reason: CaptchaErrorMessages.CAPTCHA_VERIFICATION_REQUIRED,
        }
        callback(errorResponse)
        return
      }
      if (
        config.socket.data.usedCaptchaForKeys === true &&
        config.socket.data.captchaKeyGrant?.teamId !== teamId
      ) {
        const errorResponse: GeneratePublicKeysMessage = {
          ts: DateTime.utc().toMillis(),
          status: CommunityOperationStatus.ERROR,
          reason: CaptchaErrorMessages.CAPTCHA_VERIFICATION_REQUIRED,
        }
        callback(errorResponse)
        return
      }
      // Reserve the grant before awaiting storage. Repeated requests for this team
      // share the public response, including when its first acknowledgement is lost.
      // A failed provisioning attempt keeps the team reservation but can be retried.
      const grant: CaptchaKeyGrant = config.socket.data.captchaKeyGrant ?? {
        teamId,
      }
      config.socket.data.captchaKeyGrant = grant
      config.socket.data.usedCaptchaForKeys = true
      grant.response ??= Promise.resolve()
        .then(async (): Promise<GeneratePublicKeysMessage> => {
          const serverWithSecrets =
            await config.communitiesManager.getServerKeys(
              teamId,
              AllowedServerKeyState.NOT_STORED,
            )
          return {
            ts: DateTime.utc().toMillis(),
            status: CommunityOperationStatus.SUCCESS,
            payload: {
              teamId,
              serverId: serverWithSecrets.serverId,
              identityKeys: redactKeys(
                serverWithSecrets.identityKeys,
              ) as Keyset,
              keys: redactKeys(serverWithSecrets.keys) as Keyset,
            },
          }
        })
        .catch((error: unknown) => {
          // Only touch the captured grant: a fresh captcha may have renewed the
          // socket's grant while this request was awaiting storage.
          grant.response = undefined
          throw error
        })
      callback(await grant.response)
    } catch (e) {
      _logger.error(`Error while processing get public keys event`, e)
      const errorResponse: GeneratePublicKeysMessage = {
        ts: DateTime.utc().toMillis(),
        status: CommunityOperationStatus.ERROR,
        reason: `Error while handling get public keys event`,
      }
      callback(errorResponse)
    }
  }

  /**
   * Handle incoming auth sync message and pass along to the auth sync connection
   *
   * @param message Auth sync message
   */
  async function handleAuthSync(message: AuthSyncMessage): Promise<void> {
    let authConnection: AuthConnection | undefined = undefined
    try {
      const { payload } = message
      const { teamId, userId } = payload

      // get the managed community by ID and return an error if not found
      const community = await config.communitiesManager.get(teamId)
      if (community == null) {
        throw new Error(`No community found`)
      }

      // get the existing auth connection for this user and return an error if not found
      authConnection = community.authConnections?.get(userId)
      if (authConnection == null) {
        _logger.warn(
          `Rejecting auth-sync: no auth connection was established for the requested community/user`,
        )
        return
      }
      if (authConnection.socketId !== config.socket.id) {
        _logger.warn(
          `Rejecting auth-sync: socket ownership mismatch for the requested community/user`,
        )
        return
      }
      // push the sync message onto the auth sync connection
      const decoded = uint8arrays.fromString(message.payload.message, 'base64')
      if (decoded.byteLength >= AUTH_SYNC_LARGE_PAYLOAD_BYTES) {
        _logger.warn(
          `Inbound auth-sync message is large: ${decoded.byteLength} bytes (user=${userId}, team=${teamId})`,
        )
      }
      authConnection.lfaConnection.deliver(decoded)
    } catch (e) {
      _logger.error(`Error while processing auth sync event`, e)
      authConnection?.lfaConnection.emit('localError', {
        message: `Error while handling auth sync`,
        type: 'SocketHandlerError',
      })
    }
  }

  // register event handlers on this socket
  registerAcknowledgedEvent(
    config.socket,
    WebsocketEvents.GeneratePublicKeys,
    handleGeneratePublicKeys,
    _logger,
    { requiresPayload: true },
  )
  registerFireAndForgetEvent(
    config.socket,
    WebsocketEvents.AuthSync,
    handleAuthSync,
    _logger,
    { requiresPayload: true },
  )
}
