import type { CommunityStorageService } from '../storage/communities.storage.service.js'
import type { Community, CommunityUpdate } from '../types.js'
import type {
  BaseHandlerOptions,
  BaseStatusPayload,
  BaseWebsocketMessage,
} from '../../websocket/ws.types.js'

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
export interface CreateCommunityResponsePayload
  extends BaseStatusPayload<undefined> {
  status: CreateCommunityStatus
  reason?: string
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
