import { Module } from '@nestjs/common'
import { TerminusModule } from '@nestjs/terminus'
import { HealthController } from './health.controller.js'

@Module({
  imports: [TerminusModule],
  providers: [HealthController],
  controllers: [HealthController],
  exports: [HealthController],
})
export class HealthModule {}
