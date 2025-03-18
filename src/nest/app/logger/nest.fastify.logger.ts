/**
 * Custom Fastify logger that outputs into a Nest logger for logging consistency
 */

import { Injectable } from '@nestjs/common'
import Fastify, {
  type FastifyBaseLogger,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import type pino from 'pino'
import { Socket as SocketIoSocket } from 'socket.io'
import { createLogger } from './nest.logger.js'

interface RequestLog {
  req: FastifyRequest
}

interface ReplyLog {
  res: FastifyReply
}

@Injectable()
export class NestFastifyLogger implements FastifyBaseLogger {
  // @ts-expect-error This is initialized in the base logger
  level: pino.LevelWithSilentOrString
  private readonly nestLogger = createLogger(Fastify.name)

  public child(bindings: unknown, options?: unknown): this {
    return this
  }

  public fatal(obj: unknown, msg?: string, ...args: unknown[]): void
  public fatal(msg: string, ...args: unknown[]): void
  public fatal<T>(objOrMsg: T, ...args: unknown[]): void {
    const message =
      typeof objOrMsg === 'string' ? objOrMsg : this.parseObj(objOrMsg)
    this.nestLogger.fatal(message, undefined, ...args)
  }

  public error(obj: unknown, msg?: string, ...args: unknown[]): void
  public error(msg: string, ...args: unknown[]): void
  public error<T>(objOrMsg: T, ...args: unknown[]): void {
    const message =
      typeof objOrMsg === 'string' ? objOrMsg : this.parseObj(objOrMsg)
    this.nestLogger.error(message, undefined, ...args)
  }

  public warn(obj: unknown, msg?: string, ...args: unknown[]): void
  public warn(msg: string, ...args: unknown[]): void
  public warn<T>(objOrMsg: T, ...args: unknown[]): void {
    const message =
      typeof objOrMsg === 'string' ? objOrMsg : this.parseObj(objOrMsg)
    this.nestLogger.warn(message, undefined, ...args)
  }

  public info(obj: unknown, msg?: string, ...args: unknown[]): void
  public info(msg: string, ...args: unknown[]): void
  public info<T>(objOrMsg: T, ...args: unknown[]): void {
    const message =
      typeof objOrMsg === 'string' ? objOrMsg : this.parseObj(objOrMsg)
    this.nestLogger.log(message, undefined, ...args)
  }

  public debug(obj: unknown, msg?: string, ...args: unknown[]): void
  public debug(msg: string, ...args: unknown[]): void
  public debug<T>(objOrMsg: T, ...args: unknown[]): void {
    const message =
      typeof objOrMsg === 'string' ? objOrMsg : this.parseObj(objOrMsg)
    this.nestLogger.debug(message, undefined, ...args)
  }

  public trace(obj: unknown, msg?: string, ...args: unknown[]): void
  public trace(msg: string, ...args: unknown[]): void
  public trace<T>(objOrMsg: T, ...args: unknown[]): void {
    const message =
      typeof objOrMsg === 'string' ? objOrMsg : this.parseObj(objOrMsg)
    this.nestLogger.verbose(message, undefined, ...args)
  }

  public silent(obj: unknown, msg?: string, ...args: unknown[]): void
  public silent(msg: string, ...args: unknown[]): void
  public silent<T>(objOrMsg: T, ...args: unknown[]): void {
    const message =
      typeof objOrMsg === 'string' ? objOrMsg : this.parseObj(objOrMsg)
    this.nestLogger.verbose(message, undefined, ...args)
  }

  private parseObj(obj: unknown): string {
    if (obj instanceof SocketIoSocket) {
      return JSON.stringify(
        {
          id: obj.id,
          rooms: obj.rooms,
          remote: {
            addr: obj.conn.remoteAddress,
            transport: obj.conn.transport,
            state: obj.conn._readyState,
          },
          request: {
            code: obj.request.statusCode,
            statusMsg: obj.request.statusMessage,
            headers: JSON.stringify(obj.request.headers, null, 2),
            method: obj.request.method,
          },
        },
        null,
        2,
      )
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unnecessary-condition -- This is a valid type assertion
    } else if ((obj as RequestLog).req != null) {
      // @eslint-ignore
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- This is a valid type assertion
      const { req: request } = obj as RequestLog
      return JSON.stringify(
        {
          id: request.id,
          remoteAddr: request.ip,
          params: JSON.stringify(request.params, null, 2),
          headers: JSON.stringify(request.headers, null, 2),
          method: request.method,
          query: JSON.stringify(request.query, null, 2),
          socket: {
            addr: request.socket.remoteAddress,
            state: request.socket.readyState,
            bytesRead: request.socket.bytesRead,
            bytesWritten: request.socket.bytesWritten,
          },
        },
        null,
        2,
      )
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unnecessary-condition -- This is a valid type assertion
    } else if ((obj as ReplyLog).res != null) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- This is a valid type assertion
      const { res: reply } = obj as ReplyLog
      return JSON.stringify(
        {
          statusCode: reply.statusCode,
        },
        null,
        2,
      )
    } else if (obj instanceof Error) {
      return obj.stack ?? `${obj.name}: ${obj.message}`
    }

    this.info(typeof obj)

    try {
      return JSON.stringify(obj, null, 2)
    } catch (e) {
      return 'UNKNOWN_OBJ'
    }
  }
}
