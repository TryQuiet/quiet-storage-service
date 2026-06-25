import { describe, expect, it, jest } from '@jest/globals'

import { QuietNestLogger } from './nest.default.logger.js'

describe(QuietNestLogger.name, () => {
  it('skips formatting when the active log level drops the message', () => {
    const logger = new QuietNestLogger('Skipped', { logLevels: ['warn'] })
    const payload: Record<string, unknown> = {}
    const getExpensiveValue = jest.fn(() => 'expensive')
    Object.defineProperty(payload, 'expensive', {
      enumerable: true,
      get: getExpensiveValue,
    })

    logger.debug('dropped', payload)

    expect(getExpensiveValue).not.toHaveBeenCalled()
  })
})
