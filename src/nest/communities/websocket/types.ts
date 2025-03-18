import type { CommunityStorageService } from '../storage/communities.storage.service.js'
import type { Community, CommunityUpdate } from '../types.js'
import type { BaseHandlerOptions } from '../../websocket/ws.types.js'

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
export interface UpdateCommunity {
  ts: number
  payload: UpdateCommunityPayload
}

export interface UpdateCommunityPayload {
  teamId: string
  updates: CommunityUpdate
}

export enum CommunityOperationStatus {
  Error = 'error',
  Success = 'success',
  Unauthorized = 'unauthorized',
  NotFound = 'not found',
}

export interface UpdateCommunityResponse {
  ts: number
  status: CommunityOperationStatus
  reason?: string
}

export interface GetCommunity {
  ts: number
  payload: GetCommunityPayload
}

export interface GetCommunityPayload {
  id: string
}

export interface GetCommunityResponse {
  ts: number
  status: CommunityOperationStatus
  reason?: string
  payload?: Community
}
