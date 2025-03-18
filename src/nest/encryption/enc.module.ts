import { Module } from '@nestjs/common'
import { WebsocketEncryptionService } from './ws.enc.service.js'

@Module({
  providers: [WebsocketEncryptionService],
  exports: [WebsocketEncryptionService],
})
export class EncryptionModule {}
