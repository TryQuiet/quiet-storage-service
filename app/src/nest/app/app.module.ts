import { Module } from '@nestjs/common'

import { WebsocketModule } from '../websocket/ws.module.js'
import { QSSModule } from './qss/qss.module.js'
import { EncryptionModule } from '../encryption/enc.module.js'
import { WebsocketClientModule } from '../../client/ws.client.module.js'
import { StorageModule } from '../storage/storage.module.js'
import { CommunitiesModule } from '../communities/communities.module.js'
import { HealthModule } from '../rest/health/health.module.js'
import { AWSModule } from '../utils/aws/aws.module.js'

@Module({
  imports: [
    EncryptionModule,
    WebsocketModule,
    CommunitiesModule,
    QSSModule,
    WebsocketClientModule,
    StorageModule,
    HealthModule,
    AWSModule,
  ],
  controllers: [],
  providers: [],
  exports: [],
})
export class AppModule {}
