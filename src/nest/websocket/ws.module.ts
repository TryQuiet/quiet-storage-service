import { Module } from '@nestjs/common'
import { SocketGateway } from './ws.gateway.js'

@Module({
  providers: [SocketGateway],
})
export class SocketModule {}
