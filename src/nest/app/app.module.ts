import { Module } from '@nestjs/common'
import { CommunityModule } from '../rest/community/community.module.js'

import { SocketModule } from '../websocket/ws.module.js'

@Module({
  imports: [SocketModule, CommunityModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
