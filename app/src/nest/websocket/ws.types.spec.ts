import {
  formatSocketPeerForSecurityLog,
  getClientIp,
  type QuietSocket,
} from './ws.types.js'

describe('websocket socket identity', () => {
  it('uses the socket peer address instead of spoofable proxy headers', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- minimal socket shape used by getClientIp
    const socket = {
      handshake: {
        address: '203.0.113.10',
        headers: {
          'cf-connecting-ip': '198.51.100.20',
          'x-forwarded-for': '198.51.100.30, 198.51.100.40',
        },
      },
    } as unknown as QuietSocket

    expect(getClientIp(socket)).toBe('203.0.113.10')
  })

  it('keeps proxy headers in peer logs for attribution context', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- minimal socket shape used by formatSocketPeerForSecurityLog
    const socket = {
      handshake: {
        address: '203.0.113.10',
        headers: {
          'cf-connecting-ip': '198.51.100.20',
          'x-forwarded-for': '198.51.100.30',
          'user-agent': 'Quiet Test',
        },
      },
    } as unknown as QuietSocket

    expect(formatSocketPeerForSecurityLog(socket)).toContain(
      'remoteAddress="203.0.113.10"',
    )
    expect(formatSocketPeerForSecurityLog(socket)).toContain(
      'forwardedFor="198.51.100.30"',
    )
    expect(formatSocketPeerForSecurityLog(socket)).toContain(
      'cfConnectingIp="198.51.100.20"',
    )
  })
})
