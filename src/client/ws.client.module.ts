import { Module } from '@nestjs/common'
import { EncryptionModule } from '../nest/encryption/enc.module.js'
import { WebsocketClient } from './ws.client.js'

@Module({
  imports: [EncryptionModule],
  providers: [WebsocketClient],
  exports: [WebsocketClient],
})
export class WebsocketClientModule {}
