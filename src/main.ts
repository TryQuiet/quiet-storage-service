import { Logger } from '@nestjs/common'
import { QSS } from './app/server'

const logger: Logger = new Logger('Main')

async function bootstrap(): Promise<void> {
  const server = new QSS(3000)
  await server.init()
  await server.start()
}

bootstrap().catch((reason: unknown) => {
  logger.error(reason)
})
