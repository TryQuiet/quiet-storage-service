import '@dotenvx/dotenvx/config'

import { Logger } from '@nestjs/common'
import { QSSService } from './app/qss.service'
import { env } from 'process'

const logger: Logger = new Logger('Main')

async function bootstrap(): Promise<void> {
  const server = new QSSService(Number(env.PORT), env.HOSTNAME)
  await server.init()
  await server.start()
}

bootstrap().catch((reason: unknown) => {
  logger.error(reason)
})
