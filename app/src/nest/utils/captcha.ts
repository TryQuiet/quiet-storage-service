import { ConfigService } from './config/config.service.js'
import { EnvVars } from './config/env_vars.js'
import { Environment } from './config/types.js'

export interface HCaptchaSiteVerifyResponse {
  success: boolean
  challenge_ts?: string
  hostname?: string
  'error-codes'?: string[]
}

export function isHCaptchaSiteVerifyResponse(
  obj: unknown,
): obj is HCaptchaSiteVerifyResponse {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'success' in obj &&
    typeof (obj as { success: unknown }).success === 'boolean'
  )
}
export async function verifyHCaptchaToken(
  token: string | undefined,
): Promise<HCaptchaSiteVerifyResponse> {
  if (token == null) {
    if (ConfigService.getEnv() === Environment.Production) {
      return {
        success: false,
        'error-codes': ['hCaptcha token required'],
      }
    } else {
      return {
        success: true,
      }
    }
  }
  const hcaptchaSecret = ConfigService.getString(EnvVars.HCAPTCHA_SECRET)
  if (hcaptchaSecret == null) {
    throw new Error('hCaptcha secret not configured')
  }
  const verifyBody = new URLSearchParams({
    secret: hcaptchaSecret,
    response: token,
  })
  const verifyResponse = await fetch('https://hcaptcha.com/siteverify', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: verifyBody,
  })
  const rawVerification: unknown = await verifyResponse.json()
  if (isHCaptchaSiteVerifyResponse(rawVerification)) {
    return rawVerification
  }
  return { success: false, 'error-codes': ['Invalid hCaptcha response'] }
}
