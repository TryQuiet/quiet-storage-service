import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { NseAuthController } from './nse-auth.controller.js'
import { NseAuthService } from './nse-auth.service.js'
import { NseJwtAuthGuard } from './nse-jwt-auth.guard.js'
import { CommunitiesModule } from '../communities/communities.module.js'

@Module({
  imports: [
    CommunitiesModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: NseAuthService.getJwtSecret(),
        signOptions: { expiresIn: 900 },
      }),
    }),
  ],
  controllers: [NseAuthController],
  providers: [NseAuthService, NseJwtAuthGuard],
})
export class NseAuthModule {}
