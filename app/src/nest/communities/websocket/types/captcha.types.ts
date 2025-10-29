import type { BaseWebsocketMessage } from '../../../websocket/ws.types.js'

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
