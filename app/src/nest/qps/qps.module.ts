/**
 * QPS (Quiet Push Service) module
 *
 * Provides REST API endpoints for push notification device registration and delivery.
 * Uses Firebase Cloud Messaging (FCM) for both iOS and Android push notifications.
 * This module can be conditionally loaded based on the QPS_ENABLED environment variable.
 */
import { Module, type DynamicModule } from '@nestjs/common'
import { ConfigService } from '../utils/config/config.service.js'
import { EnvVars } from '../utils/config/env_vars.js'
import { EncryptionModule } from '../encryption/enc.module.js'
import { AWSModule } from '../utils/aws/aws.module.js'
import { QPSService } from './qps.service.js'
import { UcanService } from './ucan/ucan.service.js'
import { PushService } from './push/push.service.js'
import { createLogger } from '../app/logger/logger.js'

const logger = createLogger('QPSModule')

@Module({})
export class QPSModule {
  /**
   * Register QPS module conditionally based on QPS_ENABLED environment variable
   */
  static register(): DynamicModule {
    const isEnabled = ConfigService.getBool(EnvVars.QPS_ENABLED) === true

    if (!isEnabled) {
      logger.log('QPS is disabled - skipping module registration')
      return {
        module: QPSModule,
        imports: [],
        controllers: [],
        providers: [],
        exports: [],
      }
    }

    logger.log('QPS is enabled - registering module')

    return {
      module: QPSModule,
      imports: [EncryptionModule, AWSModule],
      controllers: [],
      providers: [QPSService, UcanService, PushService],
      exports: [QPSService, UcanService, PushService],
    }
  }
}
