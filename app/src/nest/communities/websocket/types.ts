import type { CommunityStorageService } from '../storage/communities.storage.service.js'
import type { Community, CommunityUpdate } from '../types.js'
import type {
  BaseHandlerOptions,
  BaseStatusPayload,
  BaseWebsocketMessage,
} from '../../websocket/ws.types.js'
import type { CommunitiesManagerService } from '../communities-manager.service.js'
import type { Keyset } from '@localfirst/auth'

export interface CommunitiesHandlerOptions extends BaseHandlerOptions {
  storage: CommunityStorageService
  communitiesManager: CommunitiesManagerService
}

export interface CreateCommunityPayload {
  community: Community
  teamKeyring: string
}

export interface CreateCommunity {
  ts: number
  payload: CreateCommunityPayload
}

export enum CreateCommunityStatus {
  Error = 'error',
  Success = 'success',
}

export interface CreateCommunityResponseInnerPayload {
  serverKeys: Keyset
}

export interface CreateCommunityResponsePayload
  extends BaseStatusPayload<CreateCommunityResponseInnerPayload> {
  status: CreateCommunityStatus
  reason?: string
  payload?: CreateCommunityResponseInnerPayload
}
export interface CreateCommunityResponse
  extends BaseWebsocketMessage<CreateCommunityResponsePayload> {
  ts: number
  payload: CreateCommunityResponsePayload
}
export interface UpdateCommunity
  extends BaseWebsocketMessage<UpdateCommunityPayload> {
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

export interface UpdateCommunityResponsePayload
  extends BaseStatusPayload<undefined> {
  status: CommunityOperationStatus
  reason?: string
}

export interface UpdateCommunityResponse
  extends BaseWebsocketMessage<UpdateCommunityResponsePayload> {
  ts: number
  payload: UpdateCommunityResponsePayload
}

export interface GetCommunity
  extends BaseWebsocketMessage<GetCommunityPayload> {
  ts: number
  payload: GetCommunityPayload
}

export interface GetCommunityPayload {
  id: string
}

export interface GetCommunityResponsePayload
  extends BaseStatusPayload<Community> {
  status: CommunityOperationStatus
  reason?: string
  payload?: Community
}
export interface GetCommunityResponse
  extends BaseWebsocketMessage<GetCommunityResponsePayload> {
  ts: number
  payload: GetCommunityResponsePayload
}
