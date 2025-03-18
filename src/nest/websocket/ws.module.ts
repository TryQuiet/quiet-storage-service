import { Module } from '@nestjs/common'
import { WebsocketGateway } from './ws.gateway.js'
import { EncryptionModule } from '../encryption/enc.module.js'

@Module({
  imports: [EncryptionModule],
  providers: [WebsocketGateway],
})
export class WebsocketModule {}
