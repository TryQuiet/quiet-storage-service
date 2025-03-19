import chalk from 'chalk'
import { createLogger } from '../../../nest/app/logger/logger.js'
import type { RuntimeOptions } from '../types.js'
import { input, confirm } from '@inquirer/prompts'
import { ConfigService } from '../../../nest/utils/config/config.service.js'
import { EnvVars } from '../../../nest/utils/config/env_vars.js'
import {
  DEFAULT_HOSTNAME,
  DEFAULT_LISTEN_PORT,
} from '../../../nest/app/const.js'
import { promiseWithSpinner } from '../utils/utils.js'
import { WebsocketClient } from '../../ws.client.js'
import { WebsocketEncryptionService } from '../../../nest/encryption/ws.enc.service.js'
import { SodiumHelper } from '../../../nest/encryption/sodium.helper.js'

const logger = createLogger('Client:Connect')

const connectClientPrompt = async (
  options: RuntimeOptions,
  overrides?: { port: number; hostname: string },
): Promise<WebsocketClient | undefined> => {
  const hostname = await input({
    message: `Enter the hostname of the QSS instance:`,
    default:
      overrides?.hostname ??
      options.hostname ??
      ConfigService.instance.getString(EnvVars.HOSTNAME, DEFAULT_HOSTNAME),
    validate: (value: string) => value.length > 0,
  })

  const listenPortString = await input({
    message: `Enter the listen port of the QSS instance:`,
    default:
      overrides?.port.toString() ??
      options.port ??
      ConfigService.instance
        .getInt(EnvVars.PORT, DEFAULT_LISTEN_PORT)!
        .toString(),
    validate: (value: string) => Number(value) > 0,
  })
  const listenPort = Number(listenPortString)

  const shouldConnectClient = await confirm({
    message: `Would you like to connect client to ${hostname}${listenPort}?`,
    default: true,
  })

  if (!shouldConnectClient) {
    logger.warn(chalk.dim.yellow('Not connecting client'))
    return undefined
  }

  const sodiumHelper = new SodiumHelper()
  await sodiumHelper.onModuleInit()
  const encryption = new WebsocketEncryptionService(sodiumHelper)
  const client = new WebsocketClient(listenPort, hostname, encryption)

  const result = await promiseWithSpinner(
    async () => await client.createSocket(),
    `Connecting client to ${hostname}:${listenPort}...`,
    `Done connecting client to ${hostname}:${listenPort}!`,
    `Failed to connect client to ${hostname}:${listenPort}!!!`,
  )

  if (result == null) {
    const shouldReconnect = await confirm({
      message: `Would you like to retry connecting this client?`,
      default: true,
    })

    if (!shouldReconnect) {
      logger.warn(chalk.dim.yellow('Not reconnecting client'))
      return undefined
    } else {
      return await connectClientPrompt(options, { port: listenPort, hostname })
    }
  }

  return client
}

export { connectClientPrompt as connectClient }
