import { Module } from '@nestjs/common'
import { Serializer } from './serialization/serializer.service.js'
import { DEFAULT_PACKER_CONFIG } from './serialization/const.js'
import { SERIALIZER } from '../app/const.js'

@Module({
  imports: [],
  providers: [
    {
      provide: SERIALIZER,
      useFactory: (): Serializer =>
        new Serializer({
          packer: DEFAULT_PACKER_CONFIG,
        }),
    },
  ],
  exports: [SERIALIZER],
})
export class UtilsModule {}
