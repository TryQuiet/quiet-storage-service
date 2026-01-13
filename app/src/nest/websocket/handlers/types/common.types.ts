import type { CommunitiesStorageService } from '../../../communities/storage/communities.storage.service.js'
import type { CommunitiesManagerService } from '../../../communities/communities-manager.service.js'
import type { AuthConnection } from '../../../communities/auth/auth.connection.js'
import type { BaseHandlerConfig } from '../../ws.types.js'
import type { LogEntrySyncStorageService } from '../../../communities/storage/log-entry-sync.storage.service.js'
import type { LogEntrySyncManager } from '../../../communities/sync/log-entry-sync.service.js'

export interface CommunitiesHandlerConfig extends BaseHandlerConfig {
  storage: CommunitiesStorageService
  dataSyncStorage: LogEntrySyncStorageService
  communitiesManager: CommunitiesManagerService
}

export interface CommunitiesAuthHandlerConfig extends CommunitiesHandlerConfig {
  authConnection: AuthConnection
}

export interface LogEntrySyncHandlerConfig extends BaseHandlerConfig {
  syncManager: LogEntrySyncManager
}

export enum CommunityOperationStatus {
  ERROR = 'error',
  SUCCESS = 'success',
  UNAUTHORIZED = 'unauthorized',
  NOT_FOUND = 'not found',
  SENDING = 'sending',
}
