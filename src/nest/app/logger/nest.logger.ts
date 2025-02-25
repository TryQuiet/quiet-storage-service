import { ConsoleLogger } from '@nestjs/common'
import type { CompoundError } from '../../types.js'

export class QuietNestLogger extends ConsoleLogger {
  public error(
    message: unknown,
    stack?: unknown,
    context?: unknown,
    ...rest: unknown[]
  ): void {
    if (message instanceof Error) {
      message = QuietNestLogger._formatError(message)
    }

    if (stack instanceof Error) {
      stack = QuietNestLogger._formatError(stack)
    }

    super.error(message, stack, context, ...rest)
  }

  public fatal(message: unknown, context?: unknown, ...rest: unknown[]): void {
    if (message instanceof Error) {
      message = QuietNestLogger._formatError(message)
    }

    super.fatal(message, context, ...rest)
  }

  private static _formatError(e: Error): string {
    let formattedErrors: string = QuietNestLogger._stringifyError(e)
    if ((e as CompoundError<Error>).original != null) {
      formattedErrors += `\n\nOriginal Error:\n\n`
      formattedErrors += QuietNestLogger._stringifyError(
        (e as CompoundError<Error>).original!,
      )
    }

    return formattedErrors
  }

  private static _stringifyError(possibleError: Error): string {
    return (
      possibleError.stack ?? `${possibleError.name}: ${possibleError.message}`
    )
  }
}
