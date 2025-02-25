import { Module } from '@nestjs/common'
import { WebsocketGateway } from './ws.gateway.js'

@Module({
  providers: [WebsocketGateway],
})
export class WebsocketModule {}
