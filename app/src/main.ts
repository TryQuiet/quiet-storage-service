import 'reflect-metadata'
import './nest/utils/config/config.service.js'

import { AppModule } from './nest/app/app.module.js'
import { NestFactory } from '@nestjs/core'
import { QSSService } from './nest/app/qss/qss.service.js'
import { createLogger } from './nest/app/logger/logger.js'

const logger = createLogger('Main')

/**
 * Initialize the QSS Nest app and start the server
 * test
 */
async function bootstrap(): Promise<void> {
  logger.log(`Bootstrapping QSS`)
  // This is a bit janky because it means we end up creating a temporary app context
  const context = await NestFactory.createApplicationContext(AppModule, {
    logger: createLogger('Nest'),
  })
  const qss = context.get<QSSService>(QSSService)
  await qss.init()
  await qss.start()
  logger.log(`Done bootstrapping QSS test`)
}

bootstrap().catch((reason: unknown) => {
  logger.error(reason)
})
