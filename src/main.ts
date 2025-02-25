import '@dotenvx/dotenvx/config'

import { Logger } from '@nestjs/common'

import { AppModule } from './nest/app/app.module.js'
import { NestFactory } from '@nestjs/core'
import { QSSService } from './nest/app/qss/qss.service.js'
import { WebsocketClient } from './client/ws.client.js'

const logger: Logger = new Logger('Main')

async function bootstrap(): Promise<void> {
  logger.log(`Bootstrapping QSS`)
  // This is a bit janky because it means we end up creating a temporary app context
  const context = await NestFactory.createApplicationContext(AppModule)
  const qss = context.get<QSSService>(QSSService)
  await qss.init()
  await qss.start()
  logger.log(`Done bootstrapping QSS`)

  logger.log(`Connecting client`)
  const client = qss.app!.get<WebsocketClient>(WebsocketClient)
  await client.createSocket()

  logger.log(`Sending ping from client`)
  await client.sendPing()
}

bootstrap().catch((reason: unknown) => {
  logger.error(reason)
})
