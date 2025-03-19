import chalk from 'chalk'
import { DateTime } from 'luxon'
import ora from 'ora'

import { createLogger } from '../../../nest/app/logger/logger.js'

const logger = createLogger('Client:Utils')

export const promiseWithSpinner = async <T>(
  promise: () => Promise<T>,
  text: string,
  successText: string,
  failText: string,
): Promise<T | null> => {
  const startTimeMs = DateTime.utc().toMillis()
  const spinner = ora({
    color: 'yellow',
    text: chalk.cyan(`${text}\n`),
    spinner: 'dots',
    isEnabled: true,
    discardStdin: true,
  })

  let result: T | null = null
  try {
    spinner.start()
    result = await promise()
    const elapsedMs = DateTime.utc().toMillis() - startTimeMs
    spinner.succeed(
      `${chalk.magenta(successText)} ${chalk.green(`(${elapsedMs}ms)`)}\n`,
    )
  } catch (e) {
    const elapsedMs = DateTime.utc().toMillis() - startTimeMs
    logger.error(`Error occurred while running promise in spinner`, e)
    spinner.fail(`${chalk.red(failText)} ${chalk.yellow(`(${elapsedMs}ms)`)}\n`)
  }

  return result
}
