import { jest } from '@jest/globals'
import type { InvokeCommand } from '@aws-sdk/client-lambda'
import { TrustedPushRelayClient } from './push-relay.client.js'
import {
  IOS_FALLBACK_BODY,
  IOS_FALLBACK_TITLE,
  QPS_PUSH_RELAY_VERSION,
} from './push-relay.types.js'

describe('TrustedPushRelayClient', () => {
  const canonicalPayload = {
    title: IOS_FALLBACK_TITLE,
    body: IOS_FALLBACK_BODY,
    data: { teamId: 'team-1' },
  }

  it('grants Lambda only platform, team, and token authority', async () => {
    const send = jest
      .fn<(command: InvokeCommand) => Promise<{ Payload: Uint8Array }>>()
      .mockResolvedValue({
        Payload: Buffer.from(
          JSON.stringify({
            successCount: 1,
            failureCount: 0,
            invalidTokens: [],
          }),
        ),
      })
    const client = new TrustedPushRelayClient(
      { send, destroy: jest.fn() },
      'test-relay',
    )

    await expect(
      client.send(['token-1'], canonicalPayload, 'ios'),
    ).resolves.toEqual({
      successCount: 1,
      failureCount: 0,
      invalidTokens: [],
    })

    const [command] = send.mock.calls[0]
    const { Payload: requestPayload } = command.input
    if (!(requestPayload instanceof Uint8Array)) {
      throw new Error('Expected an encoded Lambda request payload')
    }
    expect(JSON.parse(Buffer.from(requestPayload).toString('utf8'))).toEqual({
      version: QPS_PUSH_RELAY_VERSION,
      platform: 'ios',
      teamId: 'team-1',
      deviceTokens: ['token-1'],
    })
  })

  it('rejects a non-canonical payload before invoking Lambda', async () => {
    const send =
      jest.fn<(command: InvokeCommand) => Promise<{ Payload: Uint8Array }>>()
    const client = new TrustedPushRelayClient(
      { send, destroy: jest.fn() },
      'test-relay',
    )

    await expect(
      client.send(
        ['token-1'],
        { ...canonicalPayload, title: 'Mallory' },
        'ios',
      ),
    ).rejects.toThrow('non-canonical payload')
    expect(send).not.toHaveBeenCalled()
  })

  it('rejects malformed Lambda responses', async () => {
    const send = jest
      .fn<(command: InvokeCommand) => Promise<{ Payload: Uint8Array }>>()
      .mockResolvedValue({
        Payload: Buffer.from(
          JSON.stringify({
            successCount: 2,
            failureCount: 0,
            invalidTokens: ['somebody-elses-token'],
          }),
        ),
      })
    const client = new TrustedPushRelayClient(
      { send, destroy: jest.fn() },
      'test-relay',
    )

    await expect(
      client.send(['token-1'], canonicalPayload, 'ios'),
    ).rejects.toThrow('Invalid push relay response')
  })
})
