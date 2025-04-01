import { Test, type TestingModule } from '@nestjs/testing'
import { HealthController } from './health.controller.js'
import { HealthModule } from './health.module.js'
import { type HealthCheckResult, TerminusModule } from '@nestjs/terminus'
import { StorageModule } from '../../storage/storage.module.js'
import _ from 'lodash'
import { PostgresClient } from '../../storage/postgres/postgres.client.js'
import type { ServiceUnavailableException } from '@nestjs/common'

describe('HealthController', () => {
  let module: TestingModule | undefined = undefined
  let controller: HealthController | undefined = undefined

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [HealthModule, StorageModule, TerminusModule],
    }).compile()
    await module.init()

    controller = module.get<HealthController>(HealthController)
  })

  afterEach(async () => {
    await module?.close()
  })

  it('should be defined', () => {
    expect(module).toBeDefined()
    expect(controller).toBeDefined()
  })

  it('should get healthy result', async () => {
    const expectedResult: HealthCheckResult = {
      status: 'ok',
      error: {},
      details: {
        postgres: {
          status: 'up',
        },
      },
      info: {
        postgres: {
          status: 'up',
        },
      },
    }
    expect(_.isEqual(await controller?.check(), expectedResult)).toBe(true)
  })

  it('should get an unhealthy result when the postgres health check fails', async () => {
    const postgresClient = module?.get<PostgresClient>(PostgresClient)
    await postgresClient?.close()
    try {
      await controller?.check()
      expect(expect.anything()).toBeUndefined()
    } catch (e) {
      expect(e).toBeDefined()
      const expectedResult: HealthCheckResult = {
        status: 'error',
        error: {
          postgres: {
            status: 'down',
            message: 'Not connected to database',
          },
        },
        details: {
          postgres: {
            status: 'down',
            message: 'Not connected to database',
          },
        },
        info: {},
      }
      expect(
        _.isEqual(
          (e as ServiceUnavailableException).getResponse(),
          expectedResult,
        ),
      ).toBe(true)
    }
  })
})
