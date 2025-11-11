import { ConfigService } from './config/config.service.js'
import { EnvVars } from './config/env_vars.js'

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
  timeoutMs = 5000,
): Promise<HCaptchaSiteVerifyResponse> {
  if (token == null) {
    return {
      success: false,
      'error-codes': ['hCaptcha token required'],
    }
  }
  const hcaptchaSecret = ConfigService.getString(EnvVars.HCAPTCHA_SECRET_KEY)
  if (hcaptchaSecret == null) {
    throw new Error('hCaptcha secret not configured')
  }
  const verifyBody = new URLSearchParams({
    secret: hcaptchaSecret,
    response: token,
  })
  const controller = new AbortController()
  const to = setTimeout(() => {
    controller.abort()
  }, timeoutMs)
  try {
    const verifyResponse = await fetch('https://api.hcaptcha.com/siteverify', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: verifyBody,
      signal: controller.signal,
    })

    if (!verifyResponse.ok) {
      clearTimeout(to)
      return {
        success: false,
        'error-codes': ['hCaptcha verification request failed'],
      }
    }

    const rawVerification: unknown = await verifyResponse.json()
    if (isHCaptchaSiteVerifyResponse(rawVerification)) {
      return rawVerification
    }
    return { success: false, 'error-codes': ['Invalid hCaptcha response'] }
  } catch (err: unknown) {
    const isAbortError =
      typeof err === 'object' &&
      err !== null &&
      'name' in err &&
      (err as { name?: unknown }).name === 'AbortError'
    const code = isAbortError
      ? 'hcaptcha-verify-timeout'
      : 'hcaptcha-verify-network-error'
    return { success: false, 'error-codes': [code] }
  } finally {
    clearTimeout(to)
  }
}
