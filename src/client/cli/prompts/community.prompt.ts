import { confirm, input } from '@inquirer/prompts'
import {
  type CreateCommunity,
  type CreateCommunityResponse,
  CreateCommunityStatus,
} from '../../../nest/websocket/handlers/communities/types.js'
import { createLogger } from '../../../nest/app/logger/nest.logger.js'
import { isBase64 } from 'class-validator'
import { DateTime } from 'luxon'
import { WebsocketEvents } from '../../../nest/websocket/ws.types.js'
import type { WebsocketClient } from '../../ws.client.js'

const logger = createLogger('Client:Community')

const createCommunity = async (client: WebsocketClient): Promise<boolean> => {
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

  const message: CreateCommunity = {
    ts: DateTime.utc().toMillis(),
    payload: {
      name,
      teamId,
      psk,
      peerList,
      sigChain,
    },
  }
  const response = await client.sendMessage<CreateCommunityResponse>(
    WebsocketEvents.CreateCommunity,
    message,
    true,
  )
  if (response.status !== CreateCommunityStatus.Success) {
    logger.error(`Failed to create a community!`, response.reason)
    return false
  }

  logger.log(`Successfully created a new community!`)
  return true
}

export { createCommunity as createCommunityPrompt }
