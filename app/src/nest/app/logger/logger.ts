import { createDefaultLogger } from './nest.default.logger.js'
import { ConfigService } from '../../utils/config/config.service.js'
import { createWinstonLogger } from './nest.winston.logger.js'
import type { QuietLogger } from './types.js'
import { EnvVars } from '../../utils/config/env_vars.js'

export const createLogger = (
  context?: string,
  useWinston?: boolean,
): QuietLogger => {
  if (useWinston ?? ConfigService.getBool(EnvVars.USE_WINSTON_LOGGER, true)!) {
    return createWinstonLogger(context)
  }

  return createDefaultLogger(context)
}
