import '@dotenvx/dotenvx/config'

import { Logger } from '@nestjs/common'
import { env } from 'process'

import { QSSService } from './app/qss.service.js'

const logger: Logger = new Logger('Main')

async function bootstrap(): Promise<void> {
  const server = new QSSService(Number(env.PORT), env.HOSTNAME)
  await server.init()
  await server.start()
}

bootstrap().catch((reason: unknown) => {
  logger.error(reason)
})
