import { jest } from '@jest/globals'
import { Test } from '@nestjs/testing'
import { TestUtils } from '../../utils/test-utils.js'
import { WebsocketModule } from '../../../src/nest/websocket/ws.module.js'
import { TestSockets } from '../../utils/types.js'
import { WebsocketClientModule } from '../../../src/client/ws.client.module.js'
import { WebsocketEvents } from '../../../src/nest/websocket/ws.types.js'
import { DateTime } from 'luxon'
import { createLogger } from '../../../src/nest/app/logger/logger.js'
import { Ping, Pong } from '../../../src/nest/websocket/handlers/ping/types.js'
import type { QuietLogger } from '../../../src/nest/app/logger/types.js'

describe('Ping', () => {
  let sockets: TestSockets
  let logger: QuietLogger

  beforeEach(async () => {
    jest.clearAllMocks()
    const testingModule = await Test.createTestingModule({
      imports: [WebsocketModule, WebsocketClientModule],
    }).compile()

    await TestUtils.startServer(testingModule)
    logger = createLogger('E2E:Websocket:Ping')
    // each test need a new socket connection
    sockets = await TestUtils.connectClient()
  })

  beforeEach(() => {
    logger.log(`###### ${expect.getState().currentTestName}`)
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
      const payload: Ping = {
        ts: DateTime.utc().toMillis(),
      }
      const pong = await TestUtils.client.sendMessage<Pong>(
        WebsocketEvents.Ping,
        payload,
        true,
      )
      expect(pong).toEqual(
        expect.objectContaining({ success: true, ts: expect.any(Number) }),
      )
    })

    it('should return unsuccessful pong when ts is invalid', async () => {
      const payload = {
        ts: 'foobar',
      }
      const pong = await TestUtils.client.sendMessage(
        WebsocketEvents.Ping,
        payload,
        true,
      )
      expect(pong).toEqual(
        expect.objectContaining({
          success: false,
          ts: expect.any(Number),
          reason: 'Invalid ts',
        }),
      )
    })

    it('should disconnect when payload is plaintext', async () => {
      expect(sockets.client.connected).toBeTruthy()
      expect(sockets.server.connected).toBeTruthy()
      const payload: Ping = {
        ts: DateTime.utc().toMillis(),
      }
      const encryptedPong = await sockets.client.emitWithAck(
        WebsocketEvents.Ping,
        payload,
      )
      const pong = TestUtils.client.decryptPayload(encryptedPong) as Pong
      expect(pong).toEqual(
        expect.objectContaining({
          success: false,
          reason: `Payload isn't valid base64`,
          ts: expect.any(Number),
        }),
      )
      expect(sockets.client.connected).toBeFalsy()
      expect(sockets.server.connected).toBeFalsy()
    })

    it('should disconnect when payload is not a valid encrypted value', async () => {
      expect(sockets.client.connected).toBeTruthy()
      expect(sockets.server.connected).toBeTruthy()
      const payload: Ping = {
        ts: DateTime.utc().toMillis(),
      }
      const base64Payload = btoa(encodeURIComponent(JSON.stringify(payload)))
      const encryptedPong = await sockets.client.emitWithAck(
        WebsocketEvents.Ping,
        base64Payload,
      )
      const pong = TestUtils.client.decryptPayload(encryptedPong) as Pong
      expect(pong).toEqual(
        expect.objectContaining({
          success: false,
          reason: `Failed to decrypt payload with session key`,
          ts: expect.any(Number),
        }),
      )
      expect(sockets.client.connected).toBeFalsy()
      expect(sockets.server.connected).toBeFalsy()
    })
  })
})
