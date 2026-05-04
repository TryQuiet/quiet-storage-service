import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { NseAuthController } from './nse.controller.js'
import { NseAuthService } from './nse-auth.service.js'
import { NseJwtAuthGuard } from './nse-jwt-auth.guard.js'
import { CommunitiesModule } from '../communities/communities.module.js'
import { AWSModule } from '../utils/aws/aws.module.js'
import { NseJwtOptionsService } from './nse-jwt-options.service.js'

@Module({
  imports: [
    CommunitiesModule,
    AWSModule,
    JwtModule.registerAsync({
      imports: [AWSModule],
      useClass: NseJwtOptionsService,
    }),
  ],
  controllers: [NseAuthController],
  providers: [NseAuthService, NseJwtAuthGuard],
})
export class NseModule {}
