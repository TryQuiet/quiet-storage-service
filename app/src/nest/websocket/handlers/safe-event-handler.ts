import type { QuietLogger } from '../../app/logger/types.js'
import type { QuietSocket } from '../ws.types.js'

interface HandlerOptions {
  requiresPayload?: boolean
}

interface BoundaryErrorResponse {
  ts: number
  status: 'error'
  reason: string
}

type Acknowledgement<Response> = (response: Response) => void
type AcknowledgedHandler<Message, Response> = (
  message: Message,
  acknowledgement: Acknowledgement<Response>,
) => void | Promise<void>
type EventHandler<Message> = (message: Message) => void | Promise<void>

const INVALID_REQUEST_REASON = 'Invalid websocket request'

// eslint-disable-next-line @typescript-eslint/max-params -- registration keeps the event boundary explicit at each call site
export function registerAcknowledgedEvent<Message, Response>(
  socket: QuietSocket,
  event: string,
  handler: AcknowledgedHandler<Message, Response>,
  logger: QuietLogger,
  options: HandlerOptions = {},
): void {
  socket.on(
    event,
    async (message: unknown, rawAcknowledgement?: unknown): Promise<void> => {
      if (typeof rawAcknowledgement !== 'function') {
        logger.warn(`Dropping ${event} event without an acknowledgement`)
        return
      }
      const rawAcknowledge = rawAcknowledgement as Acknowledgement<Response>

      let acknowledged = false
      const acknowledge = (response: Response): void => {
        if (acknowledged) return
        acknowledged = true
        try {
          rawAcknowledge(response)
        } catch (error) {
          logger.warn(`Acknowledgement for ${event} threw`, error)
        }
      }
      const reject = (): void => {
        acknowledge(createBoundaryError() as Response)
      }

      if (!isValidMessage(message, options)) {
        logger.warn(`Rejecting malformed ${event} event`)
        reject()
        return
      }

      try {
        await handler(message as Message, acknowledge)
      } catch (error) {
        logger.warn(`Unhandled error in ${event} event handler`, error)
        reject()
      }
    },
  )
}

// eslint-disable-next-line @typescript-eslint/max-params -- registration keeps the event boundary explicit at each call site
export function registerFireAndForgetEvent<Message>(
  socket: QuietSocket,
  event: string,
  handler: EventHandler<Message>,
  logger: QuietLogger,
  options: HandlerOptions = {},
): void {
  socket.on(event, async (message: unknown): Promise<void> => {
    if (!isValidMessage(message, options)) {
      logger.warn(`Dropping malformed ${event} event`)
      return
    }

    try {
      await handler(message as Message)
    } catch (error) {
      logger.warn(`Unhandled error in ${event} event handler`, error)
    }
  })
}

function isValidMessage(
  message: unknown,
  options: HandlerOptions,
): message is Record<string, unknown> {
  if (!isRecord(message)) return false
  return options.requiresPayload !== true || isRecord(message.payload)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function createBoundaryError(): BoundaryErrorResponse {
  return {
    ts: Date.now(),
    status: 'error',
    reason: INVALID_REQUEST_REASON,
  }
}
