import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import type { PushPayload } from './push.types.js'
import {
  IOS_FALLBACK_BODY,
  IOS_FALLBACK_TITLE,
  QPS_PUSH_RELAY_VERSION,
  type PushPlatform,
  type PushRelayRequest,
  type PushRelayResponse,
} from './push-relay.types.js'

interface LambdaInvoker {
  send: (command: InvokeCommand) => Promise<{
    FunctionError?: string
    Payload?: Uint8Array
  }>
  destroy: () => void
}

export class TrustedPushRelayClient {
  constructor(
    private readonly client: LambdaInvoker,
    private readonly functionArn: string,
  ) {}

  static create(region: string, functionArn: string): TrustedPushRelayClient {
    return new TrustedPushRelayClient(new LambdaClient({ region }), functionArn)
  }

  destroy(): void {
    this.client.destroy()
  }

  async send(
    deviceTokens: string[],
    payload: PushPayload,
    platform: PushPlatform,
  ): Promise<PushRelayResponse> {
    const request = this.makeRequest(deviceTokens, payload, platform)
    const response = await this.client.send(
      new InvokeCommand({
        FunctionName: this.functionArn,
        InvocationType: 'RequestResponse',
        Payload: Buffer.from(JSON.stringify(request)),
      }),
    )
    if (response.FunctionError != null || response.Payload == null) {
      throw new Error(
        `Push relay invocation failed${response.FunctionError == null ? '' : `: ${response.FunctionError}`}`,
      )
    }

    const parsed: unknown = JSON.parse(
      Buffer.from(response.Payload).toString('utf8'),
    )
    return this.parseResponse(parsed, deviceTokens)
  }

  private makeRequest(
    deviceTokens: string[],
    payload: PushPayload,
    platform: PushPlatform,
  ): PushRelayRequest {
    const teamId = payload.data?.teamId
    const dataKeys = Object.keys(payload.data ?? {})
    const hasExpectedPresentation =
      platform === 'ios'
        ? payload.title === IOS_FALLBACK_TITLE &&
          payload.body === IOS_FALLBACK_BODY
        : payload.title == null && payload.body == null
    if (
      !hasExpectedPresentation ||
      typeof teamId !== 'string' ||
      teamId.length === 0 ||
      dataKeys.length !== 1 ||
      dataKeys[0] !== 'teamId'
    ) {
      throw new Error(
        'QPS attempted to invoke relay with a non-canonical payload',
      )
    }

    return {
      version: QPS_PUSH_RELAY_VERSION,
      platform,
      teamId,
      deviceTokens,
    }
  }

  private parseResponse(
    input: unknown,
    requestedTokens: string[],
  ): PushRelayResponse {
    if (!isRecord(input)) throw new Error('Invalid push relay response')

    const { successCount, failureCount, invalidTokens } = input
    if (
      typeof successCount !== 'number' ||
      !Number.isInteger(successCount) ||
      typeof failureCount !== 'number' ||
      !Number.isInteger(failureCount) ||
      successCount < 0 ||
      failureCount < 0 ||
      successCount + failureCount !== requestedTokens.length ||
      !isStringArray(invalidTokens) ||
      !invalidTokens.every(token => requestedTokens.includes(token))
    ) {
      throw new Error('Invalid push relay response')
    }

    return { successCount, failureCount, invalidTokens }
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return input != null && typeof input === 'object' && !Array.isArray(input)
}

function isStringArray(input: unknown): input is string[] {
  return Array.isArray(input) && input.every(item => typeof item === 'string')
}
