import { Module } from '@nestjs/common'
import { ConfigModule } from '../config/config.module.js'
import { AWSSecretsService } from './aws-secrets.service.js'
import { StorageModule } from '../../storage/storage.module.js'

@Module({
  imports: [ConfigModule, StorageModule],
  providers: [AWSSecretsService],
  exports: [AWSSecretsService],
})
export class AWSModule {}
