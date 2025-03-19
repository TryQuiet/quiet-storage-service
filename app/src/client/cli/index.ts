/* eslint-disable @typescript-eslint/no-unsafe-member-access -- ignore */
/* eslint-disable @typescript-eslint/no-unsafe-call -- ignore */

import { ConfigService } from '../../nest/utils/config/config.service.js'

import { program } from '@commander-js/extra-typings'
import type { RuntimeOptions } from './types.js'
import main from './prompts/main.prompt.js'
import { EnvVars } from '../../nest/utils/config/env_vars.js'

program.name('qss-client').description('QSS Manual Test Client')

const configService = ConfigService.instance

// Interactive mode
program
  .description('Interactive mode')
  .option('-v, --verbose', 'Verbose mode')
  .option(
    '-h, --hostname <hostname>',
    'QSS server hostname',
    configService.getString(EnvVars.HOSTNAME, 'localhost'),
  )
  .option(
    '-p, --port <listen port>',
    'QSS server listen port',
    configService.getString(EnvVars.PORT, '3000'),
  )
  .action(async (options: Partial<RuntimeOptions>) => {
    await main(options)
  })

program.parse(process.argv)
