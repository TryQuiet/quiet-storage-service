import { confirm, input } from '@inquirer/prompts'
import {
  type CreateCommunity,
  type CreateCommunityResponse,
  CreateCommunityStatus,
  CommunityOperationStatus,
  type GetCommunity,
  type GetCommunityResponse,
} from '../../../nest/communities/websocket/types/index.js'
import { createLogger } from '../../../nest/app/logger/logger.js'
import { isBase64, isHexadecimal } from 'class-validator'
import { DateTime } from 'luxon'
import { WebsocketEvents } from '../../../nest/websocket/ws.types.js'
import type { WebsocketClient } from '../../ws.client.js'
import type { Community } from '../../../nest/communities/types.js'
import * as uint8arrays from 'uint8arrays'
import {
  createDevice,
  createTeam,
  createUser,
  type DeviceWithSecrets,
  type Keyring,
  loadTeam,
  type LocalUserContext,
  type Team,
  type UserWithSecrets,
} from '@localfirst/auth'
import { randomUUID } from 'crypto'

const logger = createLogger('Client:Community')

const createCommunity = async (
  client: WebsocketClient,
): Promise<Community | undefined> => {
  const teamName = await input({
    message: `Enter the name of the community:`,
    default: undefined,
    validate: (value: string | undefined) => value != null && value !== '',
  })

  const createNewTeam = await confirm({
    message: `Would you like to create a new sigchain for ${teamName}? (If no you must enter the sigchain data manually)`,
    default: true,
  })

  let sigChain: string | undefined = undefined
  let serializedSigchain: Team | undefined = undefined
  let context: LocalUserContext | undefined = undefined
  if (createNewTeam) {
    const username = await input({
      message: `Enter your username:`,
      default: undefined,
      validate: (value: string | undefined) => value != null && value !== '',
    })
    const user: UserWithSecrets = createUser(username) as UserWithSecrets
    const device: DeviceWithSecrets = createDevice({
      userId: user.userId,
      deviceName: randomUUID(),
    })
    context = {
      user,
      device,
    }
    serializedSigchain = createTeam(teamName, context) as Team
    sigChain = uint8arrays.toString(serializedSigchain.save(), 'hex')
  } else {
    sigChain = await input({
      message: `Enter the sigchain for this community as a hex string:`,
      default: undefined,
      validate: (value: string | undefined) =>
        value != null && value !== '' && isHexadecimal(value),
    })

    const base64Context = await input({
      message: `Enter your local user context for this community as a base64 string:`,
      validate: (value: string | undefined) =>
        value != null && value !== '' && isBase64(value),
    })
    context = JSON.parse(
      uint8arrays.toString(
        uint8arrays.fromString(base64Context, 'base64'),
        'utf8',
      ),
    ) as LocalUserContext

    const base64TeamKeyring = await input({
      message: `Enter team keyring for this community as a base64 string:`,
      validate: (value: string | undefined) =>
        value != null && value !== '' && isBase64(value),
    })
    const teamKeyring: Keyring = JSON.parse(
      uint8arrays.toString(
        uint8arrays.fromString(base64TeamKeyring, 'base64'),
        'utf8',
      ),
    ) as Keyring
    serializedSigchain = loadTeam(
      uint8arrays.fromString(sigChain, 'hex'),
      context,
      teamKeyring,
    ) as Team
  }

  const community: Community = {
    teamId: serializedSigchain.id,
    sigChain,
  }
  const message: CreateCommunity = {
    ts: DateTime.utc().toMillis(),
    payload: {
      userId: context.user.userId,
      community,
      teamKeyring: uint8arrays.toString(
        uint8arrays.fromString(
          JSON.stringify(serializedSigchain.teamKeyring()),
          'utf8',
        ),
        'base64',
      ),
    },
  }
  const response = await client.sendMessage<CreateCommunityResponse>(
    WebsocketEvents.CreateCommunity,
    message,
    true,
  )
  if (response!.payload.status !== CreateCommunityStatus.SUCCESS) {
    logger.error(`Failed to create a community!`, response!.payload.reason)
    return undefined
  }

  logger.log(`Successfully created a new community!`)
  return community
}

const getCommunity = async (
  client: WebsocketClient,
  existingCommunity?: Community,
): Promise<Community | undefined> => {
  const teamId = await input({
    message: `Enter the team ID of the community (ID on the sigchain):`,
    default: existingCommunity?.teamId,
    validate: (value: string | undefined) => value != null && value !== '',
  })

  const message: GetCommunity = {
    ts: DateTime.utc().toMillis(),
    payload: {
      id: teamId,
    },
  }
  const response = await client.sendMessage<GetCommunityResponse>(
    WebsocketEvents.GetCommunity,
    message,
    true,
  )
  if (response!.payload.status !== CommunityOperationStatus.SUCCESS) {
    logger.error(
      `Failed to get a community with ID ${teamId}!`,
      response!.payload.reason,
    )
    return undefined
  }

  return response?.payload.payload
}

export { createCommunity, getCommunity }
