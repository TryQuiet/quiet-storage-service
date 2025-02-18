import { Module } from '@nestjs/common'
import { CommunityModule } from 'src/api/community/community.module'

import { SocketModule } from 'src/socket/socket.module'

@Module({
  imports: [SocketModule, CommunityModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
