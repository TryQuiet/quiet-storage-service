export const IOS_FALLBACK_TITLE = 'Quiet'
export const IOS_FALLBACK_BODY = 'You have new activity'
export const QPS_PUSH_RELAY_VERSION = 'lambda-v1'

export type PushPlatform = 'ios' | 'android'

/**
 * This deliberately narrow request is the complete authority granted to QSS.
 * The relay, not QSS, constructs the FCM/APNs envelope.
 */
export interface PushRelayRequest {
  version: typeof QPS_PUSH_RELAY_VERSION
  platform: PushPlatform
  teamId: string
  deviceTokens: string[]
}

export interface PushRelayResponse {
  successCount: number
  failureCount: number
  invalidTokens: string[]
}
