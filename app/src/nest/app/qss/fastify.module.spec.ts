import { parseTrustProxyHops } from './fastify.module.js'

describe('parseTrustProxyHops', () => {
  it.each([
    [undefined, 0],
    ['0', 0],
    ['1', 1],
    ['12', 12],
  ])('parses %s as an exact hop count', (raw, expected) => {
    expect(parseTrustProxyHops(raw)).toBe(expected)
  })

  it.each(['', '-1', '+1', '01', '1garbage', '1.0', '9007199254740992'])(
    'rejects malformed or unsafe value %s',
    raw => {
      expect(() => parseTrustProxyHops(raw)).toThrow('TRUST_PROXY_HOPS must be')
    },
  )
})
