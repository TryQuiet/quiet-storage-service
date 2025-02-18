import { Module } from '@nestjs/common'

import { SocketModule } from 'src/socket/socket.module'

@Module({
  imports: [SocketModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
