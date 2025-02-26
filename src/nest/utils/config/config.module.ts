import { Module } from '@nestjs/common'
import { ConfigService } from './config.service.js'

@Module({
  providers: [
    {
      provide: ConfigService,
      useFactory: () => ConfigService.instance,
    },
  ],
  exports: [ConfigService],
})
export class ConfigModule {}
