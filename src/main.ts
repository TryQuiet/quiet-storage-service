import 'reflect-metadata'
import './nest/utils/config/config.service.js'

import { AppModule } from './nest/app/app.module.js'
import { NestFactory } from '@nestjs/core'
import { QSSService } from './nest/app/qss/qss.service.js'
import { createLogger } from './nest/app/logger/nest.logger.js'
import { WebsocketClient } from './client/ws.client.js'

const logger = createLogger('Main')

async function bootstrap(): Promise<void> {
  logger.log(`Bootstrapping QSS`)
  // This is a bit janky because it means we end up creating a temporary app context
  const context = await NestFactory.createApplicationContext(AppModule)
  const qss = context.get<QSSService>(QSSService)
  await qss.init()
  await qss.start()
  logger.log(`Done bootstrapping QSS`)
  const client = qss.app!.get<WebsocketClient>(WebsocketClient)
  await client.createSocket()
}

bootstrap().catch((reason: unknown) => {
  logger.error(reason)
})
