import {
  ConsoleLogger,
  type LogLevel,
  type ConsoleLoggerOptions,
} from '@nestjs/common'
import winston, { format, type Logger, transports } from 'winston'
import 'winston-daily-rotate-file'
import type { CompoundError } from '../../utils/errors.js'
import colors from 'ansi-colors'
import { ConfigService } from '../../utils/config/config.service.js'
import { EnvVars } from '../../utils/config/env_vars.js'
import {
  CLOUDWATCH_LOG_GROUP,
  CLOUDWATCH_LOG_STREAM_BASE_NAME,
  DEFAULT_LOG_LEVEL,
} from './const.js'
import fs from 'fs'
import path from 'path'
// @ts-expect-error no types for this package
import CloudWatchTransport from 'winston-aws-cloudwatch'
import { Environment } from '../../utils/config/types.js'
import _ from 'lodash'

const DEFAULT_LOG_MAX_SIZE = '20m'
const DEFAULT_LOG_MAX_FILES = '14d'
// CloudWatch PutLogEvents rejects events >1 MiB. Cap well under that to leave
// room for the 26-byte per-event overhead AWS adds and any UTF-8 expansion.
const CLOUDWATCH_MAX_EVENT_BYTES = 500_000
const CLOUDWATCH_TRUNCATION_SUFFIX = '…[truncated]'

const truncateUtf8 = (value: string, maxBytes: number): string => {
  const buf = Buffer.from(value, 'utf8')
  if (buf.byteLength <= maxBytes) return value
  const suffixBytes = Buffer.byteLength(CLOUDWATCH_TRUNCATION_SUFFIX, 'utf8')
  const sliceEnd = Math.max(0, maxBytes - suffixBytes)
  // toString may split a multibyte char; that's fine — we just append the marker.
  return (
    buf.subarray(0, sliceEnd).toString('utf8') + CLOUDWATCH_TRUNCATION_SUFFIX
  )
}

export const createWinstonLogger = (
  context?: string,
): QuietWinstonNestLogger => {
  const logLevel = ConfigService.getString(
    EnvVars.LOG_LEVEL,
    DEFAULT_LOG_LEVEL,
  ) as LogLevel
  const logger = new QuietWinstonNestLogger(context, {
    logLevels: [logLevel],
  })

  return logger
}

export class QuietWinstonNestLogger extends ConsoleLogger {
  private static sharedWinstonLogger: Logger | undefined = undefined

  private winstonLogger: Logger
  public readonly context?: string

  constructor(context?: string, options?: ConsoleLoggerOptions) {
    context != null
      ? options != null
        ? super(context, options)
        : super(context)
      : super()
    this.context = context
    this.winstonLogger = QuietWinstonNestLogger.getOrCreateWinstonLogger(
      this.options.logLevels ?? [DEFAULT_LOG_LEVEL],
    )
  }

  private static getOrCreateWinstonLogger(logLevels: LogLevel[]): Logger {
    QuietWinstonNestLogger.sharedWinstonLogger ??=
      QuietWinstonNestLogger.initWinston(logLevels)
    return QuietWinstonNestLogger.sharedWinstonLogger
  }

  public static resetSharedLoggerForTests(): void {
    QuietWinstonNestLogger.sharedWinstonLogger?.close()
    QuietWinstonNestLogger.sharedWinstonLogger = undefined
  }

  private static initWinston(logLevels: LogLevel[]): Logger {
    const logDir = ConfigService.getString(EnvVars.LOG_DIR, 'logs/')!
    fs.mkdirSync(logDir, { recursive: true })
    const logMaxSize = ConfigService.getString(
      EnvVars.LOG_MAX_SIZE,
      DEFAULT_LOG_MAX_SIZE,
    )!
    const logMaxFiles = ConfigService.getString(
      EnvVars.LOG_MAX_FILES,
      DEFAULT_LOG_MAX_FILES,
    )!
    const ourTransports: winston.transport[] = [
      QuietWinstonNestLogger.withTransportErrorHandler(
        new transports.DailyRotateFile({
          // %DATE will be replaced by the current date
          filename: path.join(logDir, `error_%DATE%.log`),
          level: 'error',
          format: format.combine(format.timestamp(), format.json()),
          datePattern: 'YYYY-MM-DD',
          zippedArchive: false, // don't want to zip our logs
          maxSize: logMaxSize,
          maxFiles: logMaxFiles,
        }),
        'daily-error-file',
      ),
      // same for all levels
      QuietWinstonNestLogger.withTransportErrorHandler(
        new transports.DailyRotateFile({
          filename: path.join(logDir, `log_%DATE%.log`),
          format: format.combine(format.timestamp(), format.json()),
          datePattern: 'YYYY-MM-DD',
          zippedArchive: false,
          maxSize: logMaxSize,
          maxFiles: logMaxFiles,
        }),
        'daily-file',
      ),
      QuietWinstonNestLogger.withTransportErrorHandler(
        new transports.Console({
          format: format.combine(
            format.cli({ all: true }),
            format.splat(),
            format.timestamp(),
            format.errors(),
            format.printf(
              info =>
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-unsafe-return -- from example
                `${colors.whiteBright.bold(info.timestamp as string).trim()} ${colors.magenta(info.context as string).trim()} ${colors.italic(info.level).trim()}: ${colors.bold(info.message as string).trim()} ${((info.params as any[] | undefined) ?? []).map(param => param).join(' ')}`,
            ),
          ),
        }),
        'console',
      ),
    ]

    if (
      ConfigService.getBool(EnvVars.CLOUDWATCH_LOGS_ENABLED, false) ??
      false
    ) {
      ourTransports.push(
        QuietWinstonNestLogger.withTransportErrorHandler(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- this is typing nonsense
          new CloudWatchTransport({
            logGroupName: CLOUDWATCH_LOG_GROUP,
            logStreamName: `${CLOUDWATCH_LOG_STREAM_BASE_NAME}-${ConfigService.getEnv() === Environment.Production ? 'prod' : 'dev'}`,
            createLogGroup: true,
            createLogStream: true,
            submissionInterval: 2000,
            submissionRetryCount: 1,
            batchSize: 20,
            awsConfig: {
              accessKeyId: ConfigService.getString(EnvVars.AWS_ACCESS_KEY_ID),
              secretAccessKey: ConfigService.getString(EnvVars.AWS_SECRET_KEY),
              region: ConfigService.getString(EnvVars.AWS_REGION),
            },
            formatLog: (item: { level: any; message: any; meta: unknown }) => {
              const meta = item.meta as { context?: string }
              const formatted = `${item.level}: [${meta.context ?? ''}] ${item.message} ${QuietWinstonNestLogger.stringifyMeta(item.meta)}`
              return truncateUtf8(formatted, CLOUDWATCH_MAX_EVENT_BYTES)
            },
          }) as winston.transport,
          'cloudwatch',
        ),
      )
    }

    const logger = winston.createLogger({
      level: QuietWinstonNestLogger._nestToWinstonLogLevel(logLevels),
      levels: winston.config.cli.levels,
      transports: ourTransports,
    })
    return logger
  }

  private static withTransportErrorHandler<T extends winston.transport>(
    transport: T,
    name: string,
  ): T {
    transport.on('error', (error: unknown) => {
      const formattedError =
        error instanceof Error
          ? (error.stack ?? `${error.name}: ${error.message}`)
          : String(error)
      process.stderr.write(
        `[QSS logger] ${name} transport error: ${formattedError}\n`,
      )
    })
    return transport
  }

  private static stringifyMeta(meta: unknown): string {
    try {
      return JSON.stringify(meta)
    } catch (e) {
      return '[unserializable-meta]'
    }
  }

  private getActiveWinstonLogger(): Logger {
    if (this.winstonLogger.transports.length === 0) {
      this.winstonLogger = QuietWinstonNestLogger.getOrCreateWinstonLogger(
        this.options.logLevels ?? [DEFAULT_LOG_LEVEL],
      )
    }

    return this.winstonLogger
  }

  public extend(context: string): QuietWinstonNestLogger {
    return createWinstonLogger(
      `${this.context != null ? `${this.context}:` : ''}${context}`,
    )
  }

  public log(message: unknown, context?: string): void
  public log(message: unknown, ...rest: [...any, string?]): void
  public log(message: unknown, ...rest: unknown[]): void {
    this.getActiveWinstonLogger().info(message as string, {
      context: this.context,
      params: this._parseParams(rest),
    })
  }

  public info(message: unknown, context?: string): void
  public info(message: unknown, ...rest: [...any, string?]): void
  public info(message: unknown, ...rest: unknown[]): void {
    this.getActiveWinstonLogger().info(message as string, {
      context: this.context,
      params: this._parseParams(rest),
    })
  }

  public warn(message: unknown, context?: string): void
  public warn(message: unknown, ...rest: [...any, string?]): void
  public warn(message: unknown, ...rest: unknown[]): void {
    this.getActiveWinstonLogger().warn(message as string, {
      context: this.context,
      params: this._parseParams(rest),
    })
  }

  public debug(message: unknown, context?: string): void
  public debug(message: unknown, ...rest: [...any, string?]): void
  public debug(message: unknown, ...rest: unknown[]): void {
    this.getActiveWinstonLogger().debug(message as string, {
      context: this.context,
      params: this._parseParams(rest),
    })
  }

  public verbose(message: unknown, context?: string): void
  public verbose(message: unknown, ...rest: [...any, string?]): void
  public verbose(message: unknown, ...rest: unknown[]): void {
    this.getActiveWinstonLogger().verbose(message as string, {
      context: this.context,
      params: this._parseParams(rest),
    })
  }

  public error(message: unknown, stack?: string, context?: string): void
  public error(
    message: unknown,
    stack?: unknown,
    context?: unknown,
    ...rest: unknown[]
  ): void
  public error(message: unknown, ...rest: [...any, string?, string?]): void {
    if (message instanceof Error) {
      message = this._formatError(message, 'error')
    }

    this.getActiveWinstonLogger().error(message as string, {
      context: this.context,
      params: this._parseParams(rest),
    })
  }

  public fatal(message: unknown, context?: string): void
  public fatal(message: unknown, ...rest: [...any, string?]): void
  public fatal(message: unknown, ...rest: unknown[]): void {
    if (message instanceof Error) {
      message = this._formatError(message, 'fatal')
    }

    this.getActiveWinstonLogger().error(message as string, {
      context: this.context,
      params: this._parseParams(rest),
    })
  }

  private _parseParams(rest: unknown[] = []): unknown[] {
    return rest.map((param: unknown) => {
      if (param instanceof Error) {
        return this._formatError(param, 'error')
      }
      return this._formatParam(param)
    })
  }

  private _formatError(e: Error, level: 'error' | 'fatal'): string {
    let formattedErrors: string = QuietWinstonNestLogger._stringifyError(e)
    if ((e as CompoundError<Error>).original != null) {
      formattedErrors += `\n\nOriginal Error:\n\n`
      formattedErrors += QuietWinstonNestLogger._stringifyError(
        (e as CompoundError<Error>).original!,
      )
    }

    return colors.red(formattedErrors)
  }

  private _formatParam(param: unknown): unknown {
    let formatted: any = undefined
    if (['string', 'number', 'boolean', 'bigint'].includes(typeof param)) {
      formatted = param
    } else if (param == null) {
      formatted = 'undefined'
    } else {
      try {
        formatted = JSON.stringify(param, null, 2)
      } catch (e) {
        formatted = param
      }
    }

    return formatted
  }

  protected override formatContext(context?: string): string {
    if (context == null) {
      return ''
    }

    context = `[${context}] `
    return colors.cyan.bold(context)
  }

  private static _stringifyError(possibleError: Error): string {
    return (
      possibleError.stack ?? `${possibleError.name}: ${possibleError.message}`
    )
  }

  private static _nestToWinstonLogLevel(nestLogLevels: LogLevel[]): string {
    const winstonLogLevels: number[] = []
    for (const nestLevel of nestLogLevels) {
      let winstonLevel: number | undefined = undefined
      switch (nestLevel) {
        case 'verbose':
          winstonLevel = winston.config.cli.levels.verbose
          break
        case 'debug':
          winstonLevel = winston.config.cli.levels.debug
          break
        case 'log':
          winstonLevel = winston.config.cli.levels.info
          break
        case 'warn':
          winstonLevel = winston.config.cli.levels.warn
          break
        case 'error':
          winstonLevel = winston.config.cli.levels.error
          break
        case 'fatal':
          winstonLevel = winston.config.cli.levels.error
          break
      }
      winstonLogLevels.push(winstonLevel)
    }
    const maxLevel = Math.max(...winstonLogLevels)
    const level = _.findKey(
      winston.config.cli.levels,
      (numericLevel: number) => numericLevel === maxLevel,
    )
    return level!
  }
}
