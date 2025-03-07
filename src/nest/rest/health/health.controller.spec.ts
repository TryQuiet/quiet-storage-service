import { Test, type TestingModule } from '@nestjs/testing'
import { HealthController } from './health.controller.js'

describe('HealthController', () => {
  let controller: HealthController | undefined = undefined

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile()

    controller = module.get<HealthController>(HealthController)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })
})
