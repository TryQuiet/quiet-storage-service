import { Module } from '@nestjs/common'
import { AWSSecretsService } from './aws-secrets.service.js'
import { StorageModule } from '../../storage/storage.module.js'

@Module({
  imports: [StorageModule],
  providers: [AWSSecretsService],
  exports: [AWSSecretsService],
})
export class AWSModule {}
