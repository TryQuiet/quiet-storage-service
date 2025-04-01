import { Module } from '@nestjs/common'
import { WebsocketEncryptionService } from './ws.enc.service.js'
import { ServerKeyManagerService } from './server-key-manager.service.js'
import { AWSModule } from '../utils/aws/aws.module.js'
import { SodiumHelper } from './sodium.helper.js'

@Module({
  imports: [AWSModule],
  providers: [
    WebsocketEncryptionService,
    ServerKeyManagerService,
    SodiumHelper,
  ],
  exports: [WebsocketEncryptionService, ServerKeyManagerService, SodiumHelper],
})
export class EncryptionModule {}
