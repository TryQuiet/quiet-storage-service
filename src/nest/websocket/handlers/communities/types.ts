import type { CommunityStorageService } from '../../../storage/communities/community.storage.service.js'
import type { Community } from '../../../storage/communities/types.js'
import type { BaseHandlerOptions } from '../types.js'

export interface CommunitiesHandlerOptions extends BaseHandlerOptions {
  storage: CommunityStorageService
}

export interface CreateCommunity {
  ts: number
  payload: Community
}

export enum CreateCommunityStatus {
  Error = 'error',
  Success = 'success',
}

export interface CreateCommunityResponse {
  ts: number
  status: CreateCommunityStatus
  reason?: string
}
