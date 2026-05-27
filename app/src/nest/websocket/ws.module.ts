import { Module } from '@nestjs/common'
import { WebsocketGateway } from './ws.gateway.js'
import { CommunitiesModule } from '../communities/communities.module.js'
import { QPSModule } from '../qps/qps.module.js'
import { AWSModule } from '../utils/aws/aws.module.js'
import { CaptchaService } from '../utils/captcha.js'

@Module({
  imports: [CommunitiesModule, QPSModule.register(), AWSModule],
  providers: [WebsocketGateway, CaptchaService],
})
export class WebsocketModule {}
