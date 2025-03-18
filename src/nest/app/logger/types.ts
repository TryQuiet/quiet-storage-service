import type { QuietNestLogger } from './nest.default.logger.js'
import type { QuietWinstonNestLogger } from './nest.winston.logger.js'

export type QuietLogger = QuietNestLogger | QuietWinstonNestLogger
