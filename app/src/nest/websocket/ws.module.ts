import { Module } from '@nestjs/common'
import { WebsocketGateway } from './ws.gateway.js'
import { CommunitiesModule } from '../communities/communities.module.js'
import { QPSModule } from '../qps/qps.module.js'
import { AWSModule } from '../utils/aws/aws.module.js'
import { CaptchaService } from '../utils/captcha.js'
import {
  CiEnrollmentService,
  ciEnrollmentKeysProvider,
} from '../utils/ci-enrollment.service.js'
import { StorageModule } from '../storage/storage.module.js'

@Module({
  imports: [CommunitiesModule, QPSModule.register(), AWSModule, StorageModule],
  providers: [
    WebsocketGateway,
    CaptchaService,
    CiEnrollmentService,
    ciEnrollmentKeysProvider,
  ],
})
export class WebsocketModule {}
