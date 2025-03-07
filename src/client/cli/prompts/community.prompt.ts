import { confirm, input } from '@inquirer/prompts'
import {
  type CreateCommunity,
  type CreateCommunityResponse,
  CreateCommunityStatus,
  type UpdateCommunity,
  type UpdateCommunityResponse,
  UpdateCommunityStatus,
} from '../../../nest/communities/websocket/types.js'
import { createLogger } from '../../../nest/app/logger/logger.js'
import { isBase64 } from 'class-validator'
import { DateTime } from 'luxon'
import { WebsocketEvents } from '../../../nest/websocket/ws.types.js'
import type { WebsocketClient } from '../../ws.client.js'
import type {
  Community,
  CommunityUpdate,
} from '../../../nest/communities/types.js'
import { isUint8Array } from 'util/types'
import { toString as uint8ArrayToString } from 'uint8arrays'

const logger = createLogger('Client:Community')

const createCommunity = async (
  client: WebsocketClient,
): Promise<Community | undefined> => {
  const name = await input({
    message: `Enter the name of the community:`,
    default: undefined,
    validate: (value: string | undefined) => value != null && value !== '',
  })

  const teamId = await input({
    message: `Enter the team ID of the community (ID on the sigchain):`,
    default: undefined,
    validate: (value: string | undefined) => value != null && value !== '',
  })

  const psk = await input({
    message: `Enter the PSK of the community:`,
    default: undefined,
    validate: (value: string | undefined) => value != null && value !== '',
  })

  let keepAdding = true
  const peerList: string[] = []
  while (keepAdding) {
    const peer = await input({
      message: `Enter a peer address:`,
      default: undefined,
      validate: (value: string | undefined) => value != null && value !== '',
    })
    peerList.push(peer)
    keepAdding = await confirm({
      message: `Would you like to add another peer?`,
      default: true,
    })
  }

  const sigChain = await input({
    message: `Enter the sigchain for this community as a base64 string:`,
    default: undefined,
    validate: (value: string | undefined) =>
      value != null && value !== '' && isBase64(value),
  })

  const community: Community = {
    teamId,
    name,
    psk,
    peerList,
    sigChain,
  }
  const message: CreateCommunity = {
    ts: DateTime.utc().toMillis(),
    payload: community,
  }
  const response = await client.sendMessage<CreateCommunityResponse>(
    WebsocketEvents.CreateCommunity,
    message,
    true,
  )
  if (response!.status !== CreateCommunityStatus.Success) {
    logger.error(`Failed to create a community!`, response!.reason)
    return undefined
  }

  logger.log(`Successfully created a new community!`)
  return community
}

const updateCommunity = async (
  client: WebsocketClient,
  existingCommunity: Community,
): Promise<Community | undefined> => {
  const name = await input({
    message: `Enter a new community name (optional):`,
    default: existingCommunity.name,
    validate: (value: string | undefined) => value == null || value !== '',
  })

  const psk = await input({
    message: `Enter a new PSK (optional):`,
    default: existingCommunity.psk,
    validate: (value: string | undefined) => value == null || value !== '',
  })

  const changePeerList = await confirm({
    message: `Would you like to re-enter the peer list (optional)?`,
    default: false,
  })
  let keepAdding = changePeerList
  const peerList: string[] = []
  while (keepAdding) {
    const peer = await input({
      message: `Enter a peer address:`,
      default: undefined,
      validate: (value: string | undefined) => value != null && value !== '',
    })
    peerList.push(peer)
    keepAdding = await confirm({
      message: `Would you like to add another peer?`,
      default: true,
    })
  }

  const sigChain = await input({
    message: `Enter a new sigchain for this community as a base64 string (optional):`,
    default: isUint8Array(existingCommunity.sigChain)
      ? uint8ArrayToString(existingCommunity.sigChain)
      : existingCommunity.sigChain,
    validate: (value: string | undefined) =>
      value == null || (value !== '' && isBase64(value)),
  })

  const updates: CommunityUpdate = {
    name,
    psk,
    peerList: peerList.length === 0 ? existingCommunity.peerList : peerList,
    sigChain,
  }
  const message: UpdateCommunity = {
    ts: DateTime.utc().toMillis(),
    payload: {
      teamId: existingCommunity.teamId,
      updates,
    },
  }
  const response = await client.sendMessage<UpdateCommunityResponse>(
    WebsocketEvents.UpdateCommunity,
    message,
    true,
  )
  if (response!.status !== UpdateCommunityStatus.Success) {
    logger.error(
      `Failed to create a community with status ${response!.status}!`,
      response!.reason,
    )
    return existingCommunity
  }

  logger.log(`Successfully created a new community!`)
  return {
    ...existingCommunity,
    ...updates,
  }
}

export { createCommunity, updateCommunity }
