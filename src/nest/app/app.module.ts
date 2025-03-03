import { Module } from '@nestjs/common'

import { CommunityModule } from '../rest/community/community.module.js'
import { WebsocketModule } from '../websocket/ws.module.js'
import { QSSModule } from './qss/qss.module.js'
import { EncryptionModule } from '../encryption/enc.module.js'
import { WebsocketClientModule } from '../../client/ws.client.module.js'
import { StorageModule } from '../storage/storage.module.js'

@Module({
  imports: [
    EncryptionModule,
    WebsocketModule,
    CommunityModule,
    QSSModule,
    WebsocketClientModule,
    StorageModule,
  ],
  controllers: [],
  providers: [],
  exports: [],
})
export class AppModule {}
