/**
 * Push notification types for QPS (Quiet Push Service)
 */

/**
 * Push notification payload
 */
export interface PushPayload {
  title?: string
  body?: string
  data?: Record<string, string>
}

/**
 * Result of sending a push notification
 */
export interface PushResult {
  success: boolean
  error?: string
  errorCode?: PushErrorCode
}

/**
 * Error codes for push notification failures
 */
export enum PushErrorCode {
  // General errors
  INVALID_TOKEN = 'INVALID_TOKEN',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  RATE_LIMITED = 'RATE_LIMITED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',

  // FCM-specific errors
  FCM_INVALID_REGISTRATION = 'FCM_INVALID_REGISTRATION',
  FCM_NOT_REGISTERED = 'FCM_NOT_REGISTERED',
  FCM_SENDER_ID_MISMATCH = 'FCM_SENDER_ID_MISMATCH',
}

/**
 * Error thrown when push notification operations fail
 */
export class PushError extends Error {
  constructor(
    message: string,
    public readonly code: PushErrorCode,
    public readonly isTokenInvalid = false,
  ) {
    super(message)
    this.name = 'PushError'
  }
}
