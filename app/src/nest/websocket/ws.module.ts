import { Module } from '@nestjs/common'
import { WebsocketGateway } from './ws.gateway.js'
import { CommunitiesModule } from '../communities/communities.module.js'

@Module({
  imports: [CommunitiesModule],
  providers: [WebsocketGateway],
})
export class WebsocketModule {}
