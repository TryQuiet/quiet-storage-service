import { jest } from '@jest/globals'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import {
  io as createClient,
  type Socket as ClientSocket,
} from 'socket.io-client'
import type { QuietLogger } from '../../app/logger/types.js'
import { WebsocketEvents, type QuietSocket } from '../ws.types.js'
import {
  registerAcknowledgedEvent,
  registerFireAndForgetEvent,
} from './safe-event-handler.js'

describe('safe websocket event registration', () => {
  let listener: (...args: unknown[]) => Promise<void>
  let socket: QuietSocket
  let logger: QuietLogger

  beforeEach(() => {
    const socketStub = {
      on: jest.fn(
        (
          _event: string,
          registeredListener: (...args: unknown[]) => Promise<void>,
        ) => {
          listener = registeredListener
          return socketStub
        },
      ),
    }
    socket = socketStub as unknown as QuietSocket
    logger = { warn: jest.fn() } as unknown as QuietLogger
  })

  it('drops acknowledged events with no acknowledgement before invoking business logic', async () => {
    const handler = jest.fn<() => Promise<void>>()
    registerAcknowledgedEvent(socket, 'test-event', handler, logger, {
      requiresPayload: true,
    })

    await expect(listener({ payload: {} })).resolves.toBeUndefined()
    expect(handler).not.toHaveBeenCalled()
  })

  it('returns a bounded error for malformed acknowledged events', async () => {
    const handler = jest.fn<() => Promise<void>>()
    const acknowledgement = jest.fn()
    registerAcknowledgedEvent(socket, 'test-event', handler, logger, {
      requiresPayload: true,
    })

    await expect(listener(null, acknowledgement)).resolves.toBeUndefined()
    expect(handler).not.toHaveBeenCalled()
    expect(acknowledgement).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        reason: 'Invalid websocket request',
      }),
    )
  })

  it('consumes handler rejections and acknowledges an error at most once', async () => {
    const acknowledgement = jest.fn()
    const handler = jest.fn(
      async (
        _message,
        acknowledge: (response: object) => void,
      ): Promise<void> => {
        acknowledge({ status: 'success' })
        await Promise.reject(new Error('handler failed after responding'))
      },
    )
    registerAcknowledgedEvent(socket, 'test-event', handler, logger, {
      requiresPayload: true,
    })

    await expect(
      listener({ payload: {} }, acknowledgement),
    ).resolves.toBeUndefined()
    expect(acknowledgement).toHaveBeenCalledTimes(1)
    expect(acknowledgement).toHaveBeenCalledWith({ status: 'success' })
  })

  it('contains exceptions thrown by acknowledgement functions', async () => {
    const handler = jest.fn(
      (_message, acknowledge: (response: object) => void) => {
        acknowledge({ status: 'success' })
      },
    )
    const throwingAcknowledgement = jest.fn(() => {
      throw new Error('acknowledgement failed')
    })
    registerAcknowledgedEvent(socket, 'test-event', handler, logger)

    await expect(listener({}, throwingAcknowledgement)).resolves.toBeUndefined()
  })

  it('drops malformed fire-and-forget events and consumes handler rejections', async () => {
    const handler = jest.fn(async () => {
      await Promise.reject(new Error('handler failed'))
    })
    registerFireAndForgetEvent(socket, 'test-event', handler, logger, {
      requiresPayload: true,
    })

    await expect(listener(null)).resolves.toBeUndefined()
    expect(handler).not.toHaveBeenCalled()
    await expect(listener({ payload: {} })).resolves.toBeUndefined()
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe('safe websocket event registration with Socket.IO', () => {
  it('keeps every public event boundary healthy for missing acks and malformed messages', async () => {
    const httpServer = createServer()
    const socketServer = new Server(httpServer, { transports: ['websocket'] })
    const logger = { warn: jest.fn() } as unknown as QuietLogger
    const handled = jest.fn()

    socketServer.on('connection', rawSocket => {
      const socket = rawSocket as QuietSocket
      for (const event of acknowledgedEvents) {
        registerAcknowledgedEvent(
          socket,
          event,
          (_message, acknowledge) => {
            handled(event)
            acknowledge({ status: 'success' })
          },
          logger,
          { requiresPayload: event !== WebsocketEvents.GetCaptchaSiteKey },
        )
      }
      registerFireAndForgetEvent(
        socket,
        WebsocketEvents.AuthSync,
        () => {
          handled(WebsocketEvents.AuthSync)
        },
        logger,
        { requiresPayload: true },
      )
    })

    await new Promise<void>(resolve =>
      httpServer.listen(0, '127.0.0.1', resolve),
    )
    const address = httpServer.address()
    if (address == null || typeof address === 'string')
      throw new Error('Expected TCP server address')
    const client = createClient(`http://127.0.0.1:${address.port}`, {
      transports: ['websocket'],
    })

    try {
      await waitForConnection(client)

      for (const event of acknowledgedEvents) {
        client.emit(event, validMessageFor(event))
      }
      client.emit(WebsocketEvents.AuthSync, null)

      for (const event of acknowledgedEvents) {
        const response = await emitWithAcknowledgement(client, event, null)
        expect(response).toEqual(
          expect.objectContaining({
            status: 'error',
            reason: 'Invalid websocket request',
          }),
        )
      }

      const healthResponse = await emitWithAcknowledgement(
        client,
        WebsocketEvents.GetCaptchaSiteKey,
        {},
      )
      expect(healthResponse).toEqual({ status: 'success' })
      expect(handled).toHaveBeenCalledTimes(1)
    } finally {
      client.close()
      await new Promise<void>(resolve => {
        void socketServer.close(() => {
          resolve()
        })
      })
    }
  })
})

const acknowledgedEvents = Object.values(WebsocketEvents).filter(
  event => event !== WebsocketEvents.AuthSync,
)

function validMessageFor(event: WebsocketEvents): object {
  return event === WebsocketEvents.GetCaptchaSiteKey ? {} : { payload: {} }
}

async function waitForConnection(client: ClientSocket): Promise<void> {
  if (client.connected) return
  await new Promise<void>((resolve, reject) => {
    client.once('connect', resolve)
    client.once('connect_error', reject)
  })
}

async function emitWithAcknowledgement(
  client: ClientSocket,
  event: WebsocketEvents,
  message: unknown,
): Promise<unknown> {
  return await new Promise(resolve => client.emit(event, message, resolve))
}
