import { Module } from '@nestjs/common'
import { SocketGateway } from './socket.gateway.js'

@Module({
  providers: [SocketGateway],
})
export class SocketModule {}
