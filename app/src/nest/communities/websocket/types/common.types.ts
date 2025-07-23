import type { CommunitiesStorageService } from '../../storage/communities.storage.service.js'
import type { CommunitiesManagerService } from '../../communities-manager.service.js'
import type { AuthConnection } from '../../auth/auth.connection.js'
import type { BaseHandlerConfig } from '../../../websocket/ws.types.js'

export interface CommunitiesHandlerConfig extends BaseHandlerConfig {
  storage: CommunitiesStorageService
  communitiesManager: CommunitiesManagerService
}

export interface CommunitiesAuthHandlerConfig extends CommunitiesHandlerConfig {
  authConnection: AuthConnection
}

export enum CommunityOperationStatus {
  ERROR = 'error',
  SUCCESS = 'success',
  UNAUTHORIZED = 'unauthorized',
  NOT_FOUND = 'not found',
  SENDING = 'sending',
}
