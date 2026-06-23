import {
  countConcurrentConnections,
  pruneConnectionRates,
  recordConnectionAttempt,
} from './ws-rate-limit.js'

describe('websocket rate limit helpers', () => {
  it('counts active socket IPs for the requested address', () => {
    expect(
      countConcurrentConnections(
        ['203.0.113.10', '198.51.100.20', '203.0.113.10'],
        '203.0.113.10',
      ),
    ).toBe(2)
  })

  it('records attempts and keeps only timestamps within the active window', () => {
    const connectionRates = new Map<string, number[]>([
      ['203.0.113.10', [1_000, 8_000, 9_000]],
    ])

    const count = recordConnectionAttempt(
      connectionRates,
      '203.0.113.10',
      10_000,
      2_000,
    )

    expect(count).toBe(3)
    expect(connectionRates.get('203.0.113.10')).toEqual([8_000, 9_000, 10_000])
  })

  it('prunes stale buckets and keeps fresh timestamps', () => {
    const connectionRates = new Map<string, number[]>([
      ['stale-ip', [1_000, 2_000]],
      ['mixed-ip', [1_000, 9_500]],
      ['fresh-ip', [9_000, 10_000]],
    ])

    pruneConnectionRates(connectionRates, 10_000, 1_000)

    expect(connectionRates.has('stale-ip')).toBe(false)
    expect(connectionRates.get('mixed-ip')).toEqual([9_500])
    expect(connectionRates.get('fresh-ip')).toEqual([9_000, 10_000])
  })
})
