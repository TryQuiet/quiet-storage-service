import type { BaseWebsocketMessage } from '../../ws.types.js'

export interface CaptchaVerifyPayload {
  token: string
}

export interface CaptchaVerifyMessage
  extends BaseWebsocketMessage<CaptchaVerifyPayload> {
  payload: CaptchaVerifyPayload
}

export interface CaptchaVerifyResponse
  extends BaseWebsocketMessage<undefined> {}

export interface GetCaptchaSiteKeyMessage
  extends BaseWebsocketMessage<undefined> {}

export interface GetCaptchaSiteKeyResponsePayload {
  siteKey: string
}

export interface GetCaptchaSiteKeyResponse
  extends BaseWebsocketMessage<GetCaptchaSiteKeyResponsePayload> {
  payload?: GetCaptchaSiteKeyResponsePayload
}

export enum CaptchaErrorMessages {
  CAPTCHA_VERIFICATION_REQUIRED = 'Captcha verification required',
}

export const HCAPTCHA_TEST_TOKEN = '10000000-aaaa-bbbb-cccc-000000000001'
