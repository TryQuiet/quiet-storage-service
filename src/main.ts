import './nest/utils/config/config.service.js'

import { AppModule } from './nest/app/app.module.js'
import { NestFactory } from '@nestjs/core'
import { QSSService } from './nest/app/qss/qss.service.js'
import { WebsocketClient } from './client/ws.client.js'
import type { Ping, Pong } from './nest/websocket/handlers/types.js'
import { DateTime } from 'luxon'
import { WebsocketEvents } from './nest/websocket/ws.types.js'
import { createLogger } from './nest/app/logger/nest.logger.js'

const logger = createLogger('Main')

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

  const payload: Ping = {
    ts: DateTime.utc().toMillis(),
  }
  await client.sendMessage<Pong>(WebsocketEvents.Ping, payload, true)
}

bootstrap().catch((reason: unknown) => {
  logger.error(reason)
})
