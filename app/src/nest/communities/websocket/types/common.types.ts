import type { CommunitiesStorageService } from '../../storage/communities.storage.service.js'
import type { CommunitiesManagerService } from '../../communities-manager.service.js'
import type { AuthConnection } from '../../auth/auth.connection.js'
import type { BaseHandlerOptions } from '../../../websocket/ws.types.js'

export interface CommunitiesHandlerOptions extends BaseHandlerOptions {
  storage: CommunitiesStorageService
  communitiesManager: CommunitiesManagerService
}

export interface CommunitiesAuthHandlerOptions
  extends CommunitiesHandlerOptions {
  authConnection: AuthConnection
}

export enum CommunityOperationStatus {
  ERROR = 'error',
  SUCCESS = 'success',
  UNAUTHORIZED = 'unauthorized',
  NOT_FOUND = 'not found',
}
