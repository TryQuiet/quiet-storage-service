import 'reflect-metadata'
import 'expect-more-jest'

import { jest } from '@jest/globals'
import { MikroORM } from '@mikro-orm/postgresql'

import { ConfigService } from '../src/nest/utils/config/config.service.js'
import { EnvVars } from '../src/nest/utils/config/env_vars.js'
import { createLogger } from '../src/nest/app/logger/logger.js'
import mikroOrmPostgresConfig from '../src/nest/storage/postgres/mikro-orm.postgres.config.js'

jest.setTimeout(30_000)

const logger = createLogger(`Test:Setup`)

beforeEach(() => {
  logger.log(`###### ${expect.getState().currentTestName}`)
})

afterAll(async () => {
  if (!ConfigService.getBool(EnvVars.IS_E2E, false)) {
    logger.warn(`Running unit-test only test teardown`)

    logger.log(`Clearing qss postgres database`)
    const orm = await MikroORM.init(mikroOrmPostgresConfig)
    await orm.getSchemaGenerator().clearDatabase()
    await orm.close()
  }
})
