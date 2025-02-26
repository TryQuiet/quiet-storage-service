/* eslint-disable @typescript-eslint/no-explicit-any -- It's a pain in the ass getting the typing to work otherwise */

/**
 * Extension of the NestJS Logger class that improves error logging
 *
 * NOTE: I had to do some bullshit to make this work with the ConsoleLogger class because they updated NestJS so that you can't extend
 * the regular Logger class anymore.  What's more baffling is it only threw errors in tests.
 */

import { ConsoleLogger, type LogLevel } from '@nestjs/common'
import type { CompoundError } from '../../types.js'

import colors from 'ansi-colors'

export const createLogger = (context: string): QuietNestLogger => {
  const logLevels: LogLevel[] =
    process.env.LOG_LEVELS != null && process.env.LOG_LEVELS !== ''
      ? (process.env.LOG_LEVELS.split(',') as LogLevel[])
      : (['debug', 'verbose', 'log', 'warn', 'error', 'fatal'] as LogLevel[])
  const logger = new QuietNestLogger(context, {
    logLevels,
  })
  return logger
}

export class QuietNestLogger extends ConsoleLogger {
  public extend(context: string): QuietNestLogger {
    return createLogger(
      `${this.context != null ? `${this.context}:` : ''}${context}`,
    )
  }

  public log(message: unknown, context?: string): void
  public log(message: unknown, ...rest: [...any, string?]): void
  public log(message: unknown, ...rest: unknown[]): void {
    super.log(message, ...this._parseParams(rest))
  }

  public warn(message: unknown, context?: string): void
  public warn(message: unknown, ...rest: [...any, string?]): void
  public warn(message: unknown, ...rest: unknown[]): void {
    super.warn(message, ...this._parseParams(rest))
  }

  public debug(message: unknown, context?: string): void
  public debug(message: unknown, ...rest: [...any, string?]): void
  public debug(message: unknown, ...rest: unknown[]): void {
    super.debug(message, ...this._parseParams(rest))
  }

  public verbose(message: unknown, context?: string): void
  public verbose(message: unknown, ...rest: [...any, string?]): void
  public verbose(message: unknown, ...rest: unknown[]): void {
    super.verbose(message, ...this._parseParams(rest))
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

    rest = rest.map((param: unknown) => {
      if (param instanceof Error) {
        return this._formatError(param, 'error')
      }
      return param
    })

    super.error(message, ...this._parseParams(rest))
  }

  public fatal(message: unknown, context?: string): void
  public fatal(message: unknown, ...rest: [...any, string?]): void
  public fatal(message: unknown, ...rest: unknown[]): void {
    if (message instanceof Error) {
      message = this._formatError(message, 'fatal')
    }

    super.fatal(message, ...this._parseParams(rest))
  }

  private _parseParams(rest: unknown[] = []): unknown[] {
    return this.context != null ? rest.concat(this.context) : rest
  }

  private _formatError(e: Error, level: 'error' | 'fatal'): string {
    let formattedErrors: string = QuietNestLogger._stringifyError(e)
    if ((e as CompoundError<Error>).original != null) {
      formattedErrors += `\n\nOriginal Error:\n\n`
      formattedErrors += QuietNestLogger._stringifyError(
        (e as CompoundError<Error>).original!,
      )
    }

    return this.colorize(formattedErrors, level)
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this -- this overrides an existing method
  protected override formatContext(context?: string): string {
    if (context == null) {
      return ''
    }

    context = `[${context}] `
    return colors.cyan(context)
  }

  private static _stringifyError(possibleError: Error): string {
    return (
      possibleError.stack ?? `${possibleError.name}: ${possibleError.message}`
    )
  }
}
