import '@dotenvx/dotenvx/config'

import { AppModule } from './nest/app/app.module.js'
import { NestFactory } from '@nestjs/core'
import { QSSService } from './nest/app/qss/qss.service.js'
import { WebsocketClient } from './client/ws.client.js'
import type { Ping, Pong } from './nest/websocket/handlers/types.js'
import { DateTime } from 'luxon'
import { WebsocketEvents } from './nest/websocket/ws.types.js'
import { QuietNestLogger } from './nest/app/logger/nest.logger.js'

const logger: QuietNestLogger = new QuietNestLogger('Main')

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
  const payload: Ping = {
    ts: DateTime.utc().toMillis(),
  }
  const pong = await client.sendMessage<Pong>(
    WebsocketEvents.Ping,
    payload,
    true,
  )
  logger.log(`Got pong`, pong)
}

bootstrap().catch((reason: unknown) => {
  logger.error(reason)
})
