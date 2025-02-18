import { Logger, type LoggerService } from '@nestjs/common'
import Fastify, {
  type FastifyBaseLogger,
  type FastifyRequest,
  type FastifyReply,
} from 'fastify'
import type { Bindings, ChildLoggerOptions } from 'fastify/types/logger'
import type pino from 'pino'
import { Socket as SocketIoSocket } from 'socket.io'

interface RequestLog {
  req: FastifyRequest
}

interface ReplyLog {
  res: FastifyReply
}

export class NestFastifyLogger implements FastifyBaseLogger {
  level: pino.LevelWithSilentOrString
  private readonly nestLogger: LoggerService = new Logger(Fastify.name)

  public child(bindings: Bindings, options?: ChildLoggerOptions): this {
    return this
  }

  public fatal(obj: unknown, msg?: string, ...args: unknown[]): void
  public fatal(msg: string, ...args: unknown[]): void
  public fatal<T>(objOrMsg: T, ...args: unknown[]): void {
    const message =
      typeof objOrMsg === 'string' ? objOrMsg : this.parseObj(objOrMsg)
    if (this.nestLogger.fatal != null) {
      this.nestLogger.fatal(message, ...args)
    }
  }

  public error(obj: unknown, msg?: string, ...args: unknown[]): void
  public error(msg: string, ...args: unknown[]): void
  public error<T>(objOrMsg: T, ...args: unknown[]): void {
    const message =
      typeof objOrMsg === 'string' ? objOrMsg : this.parseObj(objOrMsg)
    this.nestLogger.error(message, ...args)
  }

  public warn(obj: unknown, msg?: string, ...args: unknown[]): void
  public warn(msg: string, ...args: unknown[]): void
  public warn<T>(objOrMsg: T, ...args: unknown[]): void {
    const message =
      typeof objOrMsg === 'string' ? objOrMsg : this.parseObj(objOrMsg)
    this.nestLogger.warn(message, ...args)
  }

  public info(obj: unknown, msg?: string, ...args: unknown[]): void
  public info(msg: string, ...args: unknown[]): void
  public info<T>(objOrMsg: T, ...args: unknown[]): void {
    const message =
      typeof objOrMsg === 'string' ? objOrMsg : this.parseObj(objOrMsg)
    this.nestLogger.log(message, ...args)
  }

  public debug(obj: unknown, msg?: string, ...args: unknown[]): void
  public debug(msg: string, ...args: unknown[]): void
  public debug<T>(objOrMsg: T, ...args: unknown[]): void {
    const message =
      typeof objOrMsg === 'string' ? objOrMsg : this.parseObj(objOrMsg)
    if (this.nestLogger.debug != null) {
      this.nestLogger.debug(message, ...args)
    }
  }

  public trace(obj: unknown, msg?: string, ...args: unknown[]): void
  public trace(msg: string, ...args: unknown[]): void
  public trace<T>(objOrMsg: T, ...args: unknown[]): void {
    const message =
      typeof objOrMsg === 'string' ? objOrMsg : this.parseObj(objOrMsg)
    if (this.nestLogger.verbose != null) {
      this.nestLogger.verbose(message, ...args)
    }
  }

  public silent(obj: unknown, msg?: string, ...args: unknown[]): void
  public silent(msg: string, ...args: unknown[]): void
  public silent<T>(objOrMsg: T, ...args: unknown[]): void {
    const message =
      typeof objOrMsg === 'string' ? objOrMsg : this.parseObj(objOrMsg)
    if (this.nestLogger.verbose != null) {
      this.nestLogger.verbose(message, ...args)
    }
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
    } else if ((obj as RequestLog).req.routeOptions != null) {
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
    } else if ((obj as ReplyLog).res.compileSerializationSchema != null) {
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
