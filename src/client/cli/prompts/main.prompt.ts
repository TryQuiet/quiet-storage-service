import type { RuntimeOptions } from '../types.js'
import { connectClient } from './connect-client.prompt.js'
import actionSelect from '../components/actionSelect.js'
import type { WebsocketClient } from '../../ws.client.js'
import { WebsocketEvents } from '../../../nest/websocket/ws.types.js'
import { DateTime } from 'luxon'
import { createLogger } from '../../../nest/app/logger/nest.logger.js'
import type { Pong } from '../../../nest/websocket/handlers/ping/types.js'
import { confirm } from '@inquirer/prompts'
import { createCommunity, updateCommunity } from './community.prompt.js'
import type { Community } from '../../../nest/communities/types.js'

const logger = createLogger('Client:Main')

const connectClientLoop = async (
  options: RuntimeOptions,
): Promise<WebsocketClient> => {
  let client: WebsocketClient | undefined = undefined
  while (client == null) {
    client = await connectClient(options)
    if (client == null) {
      logger.error(`Failed to connect!`)
    }
  }

  return client
}

const mainLoop = async (
  community: Community | undefined,
  client: WebsocketClient,
  options: RuntimeOptions,
): Promise<boolean> => {
  let exit = false
  while (!exit) {
    const defaultChoices = [
      {
        name: 'Send ping',
        value: 'sendPing',
        description: 'Send ping message to server',
      },
      {
        name: 'Create community',
        value: 'createCommunity',
        description: 'Create a new community on the server',
      },
      {
        name: 'Update community',
        value: 'updateCommunity',
        description: 'Update an existing community on the server',
      },
      {
        name: 'Disconnect',
        value: 'disconnect',
        description: 'Disconnect client',
      },
    ]

    const answer = await actionSelect({
      message: 'Main Menu',
      choices: [...defaultChoices],
      actions: [
        { name: 'Select', value: 'select', key: 'e' },
        { name: 'Exit Program', value: 'exit', key: 'escape' },
      ],
    })
    switch (answer.action) {
      case 'select':
      case undefined: // catches enter/return key
        switch (answer.answer) {
          case 'sendPing': {
            const response = await client.sendMessage<Pong>(
              WebsocketEvents.Ping,
              { ts: DateTime.utc().toMillis() },
              true,
            )
            if (!response!.success) {
              logger.error(`Unsuccessful ping!`, response!.reason)
            } else {
              logger.log(`Ping success!`)
            }
            break
          }
          case 'createCommunity': {
            community = await createCommunity(client)
            break
          }
          case 'updateCommunity': {
            if (community == null) {
              logger.warn(`No community has been created!`)
            } else {
              community = await updateCommunity(client, community)
            }
            break
          }
          case 'disconnect': {
            client.close()
            const shouldConnectClient = await confirm({
              message: `Would you like to connect another client (entering \`no\` will exit the application)?`,
              default: true,
            })
            if (shouldConnectClient) {
              client = await connectClientLoop(options)
            } else {
              exit = true
            }
            break
          }
        }
        break
      case 'exit':
        exit = true
        break
    }
  }
  return exit
}

const main = async (options: RuntimeOptions): Promise<void> => {
  const client = await connectClientLoop(options)
  await mainLoop(undefined, client, options)
  logger.log(`Goodbye!`)
}

export default main
