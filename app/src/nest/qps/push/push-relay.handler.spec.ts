import { makeMessage, parseRequest } from './push-relay.handler.js'
import {
  IOS_FALLBACK_BODY,
  IOS_FALLBACK_TITLE,
  QPS_PUSH_RELAY_VERSION,
  type PushRelayRequest,
} from './push-relay.types.js'

const iosRequest: PushRelayRequest = {
  version: QPS_PUSH_RELAY_VERSION,
  platform: 'ios',
  teamId: 'team-1',
  deviceTokens: ['token-1'],
}

describe('QPS trusted push relay', () => {
  it('constructs the fixed iOS alert and forces NSE interception', () => {
    expect(makeMessage(iosRequest)).toEqual({
      tokens: ['token-1'],
      data: { teamId: 'team-1' },
      notification: {
        title: IOS_FALLBACK_TITLE,
        body: IOS_FALLBACK_BODY,
      },
      android: undefined,
      apns: {
        payload: {
          aps: {
            contentAvailable: true,
            mutableContent: true,
          },
        },
      },
    })
  })

  it('constructs an Android data-only message', () => {
    expect(
      makeMessage({
        ...iosRequest,
        platform: 'android',
      }),
    ).toEqual({
      tokens: ['token-1'],
      data: { teamId: 'team-1' },
      notification: undefined,
      android: { priority: 'high' },
      apns: undefined,
    })
  })

  it('rejects additional sender-controlled envelope fields', () => {
    expect(() =>
      parseRequest({
        ...iosRequest,
        title: 'Mallory',
      }),
    ).toThrow('unsupported fields')
  })

  it.each([
    { ...iosRequest, platform: 'web' },
    { ...iosRequest, teamId: '' },
    { ...iosRequest, deviceTokens: [] },
    { ...iosRequest, version: 'unconstrained-v0' },
  ])('rejects malformed relay requests', request => {
    expect(() => parseRequest(request)).toThrow()
  })
})
