import { pruneConnectionRates } from './ws.rate-limiter.js'

describe('pruneConnectionRates', () => {
  it('removes stale IP entries and preserves recent timestamps', () => {
    const now = Date.now()
    const connectionRates = new Map<string, number[]>([
      ['stale-ip', [now - 10_001]],
      ['mixed-ip', [now - 10_001, now - 9_999]],
      ['active-ip', [now - 9_999]],
    ])

    pruneConnectionRates(connectionRates, now - 10_000)

    expect(connectionRates.has('stale-ip')).toBe(false)
    expect(connectionRates.get('mixed-ip')).toEqual([now - 9_999])
    expect(connectionRates.get('active-ip')).toEqual([now - 9_999])
  })
})
