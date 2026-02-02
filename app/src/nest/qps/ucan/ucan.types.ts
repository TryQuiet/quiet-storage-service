/**
 * UCAN types for QPS (Quiet Push Service)
 */

/**
 * URI scheme prefix for device tokens in UCAN capabilities
 */
export const DEVICE_TOKEN_URI_SCHEME = 'fcm://'

/**
 * UCAN capability for push notifications
 */
export interface PushCapability {
  with: {
    scheme: 'fcm'
    hierPart: string // device token
  }
  can: {
    namespace: 'push'
    segments: ['send']
  }
}

/**
 * Facts included in the UCAN token
 */
export interface UcanFacts {
  bundleId: string
}

/**
 * Result of UCAN validation
 */
export interface UcanValidationResult {
  valid: boolean
  deviceToken?: string
  bundleId?: string
  error?: string
}

/**
 * Resource pointer in a UCAN capability
 */
export interface UcanResourcePointer {
  scheme: string
  hierPart: string
}

/**
 * Ability (action) in a UCAN capability
 */
export interface UcanAbility {
  namespace: string
  segments: string[]
}

/**
 * A single capability in a UCAN token
 */
export interface UcanCapability {
  with: UcanResourcePointer | string
  can: UcanAbility | string
}

/**
 * QPS-specific capability structure (as we create it)
 */
export interface QpsPushCapability {
  with: {
    scheme: string
    hierPart: string
  }
  can: {
    namespace: string
    segments: string[]
  }
}

/**
 * Parsed UCAN payload structure
 */
export interface ParsedUcanPayload {
  iss: string
  aud: string
  exp: number | null
  att: UcanCapability[]
  fct?: Array<Record<string, unknown>>
  prf?: string[]
}

/**
 * Error thrown when UCAN operations fail
 */
export class UcanError extends Error {
  constructor(
    message: string,
    public readonly code: UcanErrorCode,
  ) {
    super(message)
    this.name = 'UcanError'
  }
}

export enum UcanErrorCode {
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  INVALID_ISSUER = 'INVALID_ISSUER',
  INVALID_CAPABILITY = 'INVALID_CAPABILITY',
  EXPIRED = 'EXPIRED',
  MALFORMED = 'MALFORMED',
  KEY_NOT_INITIALIZED = 'KEY_NOT_INITIALIZED',
}
