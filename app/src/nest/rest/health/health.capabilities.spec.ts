import { HealthController } from './health.controller.js'

describe('QSS deployment capabilities', () => {
  it('advertises UCAN-bound QPS payload construction', () => {
    const controller = Object.create(
      HealthController.prototype,
    ) as HealthController
    expect(controller.capabilities().qps.payloadBinding).toBe('ucan-v1')
    expect(controller.capabilities().qps.pushCredentialIsolation).toBe(
      'development-direct',
    )
  })

  it('advertises the isolated relay only when configured in production', () => {
    const oldEnv = process.env.ENV
    const oldRegion = process.env.AWS_REGION
    const oldRelay = process.env.QPS_PUSH_RELAY_FUNCTION_ARN
    const controller = Object.create(
      HealthController.prototype,
    ) as HealthController

    try {
      process.env.ENV = 'production'
      process.env.AWS_REGION = 'us-east-1'
      delete process.env.QPS_PUSH_RELAY_FUNCTION_ARN
      expect(controller.capabilities().qps.pushCredentialIsolation).toBe(
        'unavailable',
      )

      process.env.QPS_PUSH_RELAY_FUNCTION_ARN = 'test-relay'
      expect(controller.capabilities().qps.pushCredentialIsolation).toBe(
        'lambda-v1',
      )

      delete process.env.AWS_REGION
      expect(controller.capabilities().qps.pushCredentialIsolation).toBe(
        'unavailable',
      )
    } finally {
      if (oldEnv == null) delete process.env.ENV
      else process.env.ENV = oldEnv
      if (oldRegion == null) delete process.env.AWS_REGION
      else process.env.AWS_REGION = oldRegion
      if (oldRelay == null) delete process.env.QPS_PUSH_RELAY_FUNCTION_ARN
      else process.env.QPS_PUSH_RELAY_FUNCTION_ARN = oldRelay
    }
  })
})
