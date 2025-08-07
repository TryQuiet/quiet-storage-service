import { Module } from '@nestjs/common'
import { QSSService } from './qss.service.js'
import { FastifyModule } from './fastify.module.js'
import { StorageModule } from '../../storage/storage.module.js'
import { WebsocketModule } from '../../websocket/ws.module.js'

@Module({
  imports: [FastifyModule, StorageModule, WebsocketModule],
  providers: [QSSService],
})
export class QSSModule {}
