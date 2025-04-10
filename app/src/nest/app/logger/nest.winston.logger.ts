import {
  ConsoleLogger,
  type LogLevel,
  type ConsoleLoggerOptions,
} from '@nestjs/common'
import winston, { format, type Logger, transports } from 'winston'
import 'winston-daily-rotate-file'
import type { CompoundError } from '../../types.js'
import colors from 'ansi-colors'
import { ConfigService } from '../../utils/config/config.service.js'
import { EnvVars } from '../../utils/config/env_vars.js'
import {
  CLOUDWATCH_LOG_GROUP,
  CLOUDWATCH_LOG_STREAM_BASE_NAME,
  DEFAULT_LOG_LEVEL,
} from './const.js'
import path from 'path'
// @ts-expect-error no types for this package
import CloudWatchTransport from 'winston-aws-cloudwatch'
import { Environment } from '../../utils/config/types.js'
import _ from 'lodash'

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
  private readonly winstonLogger: Logger
  public readonly context?: string
  private readonly logDir: string

  constructor(context?: string, options?: ConsoleLoggerOptions) {
    context != null
      ? options != null
        ? super(context, options)
        : super(context)
      : super()
    this.context = context
    this.logDir = ConfigService.getString(EnvVars.LOG_DIR, 'logs/')!
    this.winstonLogger = this.initWinston()
  }

  private initWinston(): Logger {
    const ourTransports: winston.transport[] = [
      new transports.DailyRotateFile({
        // %DATE will be replaced by the current date
        filename: path.join(this.logDir, `error_%DATE%.log`),
        level: 'error',
        format: format.combine(format.timestamp(), format.json()),
        datePattern: 'YYYY-MM-DD',
        zippedArchive: false, // don't want to zip our logs
        maxFiles: '30d', // will keep log until they are older than 30 days
      }),
      // same for all levels
      new transports.DailyRotateFile({
        filename: path.join(this.logDir, `log_%DATE%.log`),
        format: format.combine(format.timestamp(), format.json()),
        datePattern: 'YYYY-MM-DD',
        zippedArchive: false,
        maxFiles: '30d',
      }),
      new transports.Console({
        format: format.combine(
          format.cli({ all: true }),
          format.splat(),
          format.timestamp(),
          format.errors(),
          format.printf(
            info =>
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions, @typescript-eslint/no-unsafe-return -- from example
              `${colors.whiteBright.bold(info.timestamp as string).trim()} ${colors.magenta(info.context as string).trim()} ${colors.italic(info.level).trim()}: ${colors.bold(info.message as string).trim()} ${(info.params as any[]).map(param => param).join(' ')}`,
          ),
        ),
      }),
    ]

    if (
      ConfigService.getBool(EnvVars.CLOUDWATCH_LOGS_ENABLED, false) ??
      false
    ) {
      ourTransports.push(
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
          formatLog: (item: { level: any; message: any; meta: unknown }) =>
            `${item.level}: [${this.context}] ${item.message} ${JSON.stringify(item.meta)}`,
        }) as winston.transport,
      )
    }

    const logger = winston.createLogger({
      defaultMeta: {
        context: this.context,
      },
      level: QuietWinstonNestLogger._nestToWinstonLogLevel(
        this.options.logLevels ?? [DEFAULT_LOG_LEVEL],
      ),
      levels: winston.config.cli.levels,
      transports: ourTransports,
    })
    return logger
  }

  public extend(context: string): QuietWinstonNestLogger {
    return createWinstonLogger(
      `${this.context != null ? `${this.context}:` : ''}${context}`,
    )
  }

  public log(message: unknown, context?: string): void
  public log(message: unknown, ...rest: [...any, string?]): void
  public log(message: unknown, ...rest: unknown[]): void {
    this.winstonLogger.info(message as string, {
      params: this._parseParams(rest),
    })
  }

  public info(message: unknown, context?: string): void
  public info(message: unknown, ...rest: [...any, string?]): void
  public info(message: unknown, ...rest: unknown[]): void {
    this.winstonLogger.info(message as string, {
      params: this._parseParams(rest),
    })
  }

  public warn(message: unknown, context?: string): void
  public warn(message: unknown, ...rest: [...any, string?]): void
  public warn(message: unknown, ...rest: unknown[]): void {
    this.winstonLogger.warn(message as string, {
      params: this._parseParams(rest),
    })
  }

  public debug(message: unknown, context?: string): void
  public debug(message: unknown, ...rest: [...any, string?]): void
  public debug(message: unknown, ...rest: unknown[]): void {
    this.winstonLogger.debug(message as string, {
      params: this._parseParams(rest),
    })
  }

  public verbose(message: unknown, context?: string): void
  public verbose(message: unknown, ...rest: [...any, string?]): void
  public verbose(message: unknown, ...rest: unknown[]): void {
    this.winstonLogger.verbose(message as string, {
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

    this.winstonLogger.error(message as string, {
      params: this._parseParams(rest),
    })
  }

  public fatal(message: unknown, context?: string): void
  public fatal(message: unknown, ...rest: [...any, string?]): void
  public fatal(message: unknown, ...rest: unknown[]): void {
    if (message instanceof Error) {
      message = this._formatError(message, 'fatal')
    }

    this.winstonLogger.error(message as string, {
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
