import { Module } from '@nestjs/common'
import { CommunityModule } from '../rest/community/community.module.js'

import { WebsocketModule } from '../websocket/ws.module.js'

@Module({
  imports: [WebsocketModule, CommunityModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
