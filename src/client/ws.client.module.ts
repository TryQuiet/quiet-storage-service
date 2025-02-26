import { Module } from '@nestjs/common'
import { EncryptionModule } from '../nest/encryption/enc.module.js'
import { WebsocketClient } from './ws.client.js'
import { FastifyModule } from '../nest/app/qss/fastify.module.js'

@Module({
  imports: [EncryptionModule, FastifyModule],
  providers: [WebsocketClient],
  exports: [WebsocketClient],
})
export class WebsocketClientModule {}
