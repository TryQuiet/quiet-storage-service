import { Test } from '@nestjs/testing'
import { TestUtils } from '../../utils/test-utils.js'
import { WebsocketModule } from '../../../src/nest/websocket/ws.module.js'
import { Logger } from '@nestjs/common'
import { TestSockets } from '../../utils/types.js'
import { WebsocketClientModule } from '../../../src/client/ws.client.module.js'

describe('Ping', () => {
  let sockets: TestSockets
  let logger: Logger

  beforeEach(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [WebsocketModule, WebsocketClientModule],
    }).compile()

    await TestUtils.startServer(testingModule)
    logger = new Logger('E2E:Websocket:Ping')
    // each test need a new socket connection
    sockets = await TestUtils.connectClient()
  })

  beforeEach(() => {
    logger.debug(`###### ${expect.getState().currentTestName}`)
  })

  afterEach(async () => {
    // each test need to release the connection for next
    await TestUtils.close()
  })

  describe('Startup', () => {
    it('should have one connected client', async () => {
      expect(TestUtils.getOpenConnectionCount()).toBe(1)
    })
  })

  describe('Incoming Ping', () => {
    it('should emit a valid pong when ping is valid', async () => {
      const response = await TestUtils.client.sendPing()
      expect(response).toEqual(
        expect.objectContaining({ success: true, ts: expect.any(Number) }),
      )
    })

    // it('should do something when encryption is bad', async () => {
    //   const response = await TestUtils.client.sendPing()
    //   expect(response).toEqual(
    //     expect.objectContaining({ success: true, ts: expect.any(Number) }),
    //   )
    // })
  })
})
