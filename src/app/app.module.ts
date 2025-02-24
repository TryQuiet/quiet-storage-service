import { Module } from '@nestjs/common'
import { CommunityModule } from '../api/community/community.module.js'

import { SocketModule } from '..//socket/socket.module.js'

@Module({
  imports: [SocketModule, CommunityModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
