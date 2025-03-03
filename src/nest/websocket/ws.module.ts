import { Module } from '@nestjs/common'
import { WebsocketGateway } from './ws.gateway.js'
import { EncryptionModule } from '../encryption/enc.module.js'
import { CommunitiesModule } from '../storage/communities/communities.module.js'

@Module({
  imports: [EncryptionModule, CommunitiesModule],
  providers: [WebsocketGateway],
})
export class WebsocketModule {}
