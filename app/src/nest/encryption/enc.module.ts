import { Module } from '@nestjs/common'
import { ServerKeyManagerService } from './server-key-manager.service.js'
import { AWSModule } from '../utils/aws/aws.module.js'
import { SodiumHelper } from './sodium.helper.js'

@Module({
  imports: [AWSModule],
  providers: [ServerKeyManagerService, SodiumHelper],
  exports: [ServerKeyManagerService, SodiumHelper],
})
export class EncryptionModule {}
