export interface RDSCredentials {
  username: string
  password: string
}

export interface CachedSecretEnvVar {
  value: string
  expiresAt: number
}

export interface AwsErrorShape {
  name?: string
  code?: string
  message?: string
  $metadata?: {
    httpStatusCode?: number
  }
  $retryable?: unknown
}
