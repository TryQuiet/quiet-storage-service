import { jest } from '@jest/globals'
import { QPSService } from './qps.service.js'
import type { UcanService } from './ucan/ucan.service.js'
import type { PushService } from './push/push.service.js'

describe('QPSService', () => {
  const validateUcan = jest.fn<UcanService['validateUcan']>()
  const send = jest.fn<PushService['send']>()
  const sendMulticast = jest.fn<PushService['sendMulticast']>()

  const ucanService: Pick<UcanService, 'validateUcan'> = {
    validateUcan,
  }

  const pushService: Pick<PushService, 'send' | 'sendMulticast'> = {
    send,
    sendMulticast,
  }

  let service: QPSService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new QPSService(
      ucanService as unknown as UcanService,
      pushService as unknown as PushService,
    )
  })

  it('sends data-only pushes to Android devices', async () => {
    validateUcan.mockResolvedValue({
      valid: true,
      deviceToken: 'android-token',
      platform: 'android',
    })
    send.mockResolvedValue({ success: true })

    await service.sendPush('test-ucan', undefined, undefined, {
      teamId: 'team-1',
    })

    expect(send).toHaveBeenCalledWith(
      'android-token',
      { data: { teamId: 'team-1' } },
      'android',
    )
  })

  it('keeps fallback notification content for iOS devices', async () => {
    validateUcan.mockResolvedValue({
      valid: true,
      deviceToken: 'ios-token',
      platform: 'ios',
    })
    send.mockResolvedValue({ success: true })

    await service.sendPush('test-ucan', undefined, undefined, {
      teamId: 'team-1',
    })

    expect(send).toHaveBeenCalledWith(
      'ios-token',
      {
        title: 'Quiet',
        body: 'You have new activity',
        data: { teamId: 'team-1' },
      },
      'ios',
    )
  })

  it('splits multicast payloads by platform', async () => {
    validateUcan
      .mockResolvedValueOnce({
        valid: true,
        deviceToken: 'ios-token',
        platform: 'ios',
      })
      .mockResolvedValueOnce({
        valid: true,
        deviceToken: 'android-token',
        platform: 'android',
      })
    sendMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      invalidTokens: [],
    })

    await service.sendBatchPush(
      ['ios-ucan', 'android-ucan'],
      undefined,
      undefined,
      {
        teamId: 'team-1',
      },
    )

    expect(sendMulticast).toHaveBeenNthCalledWith(
      1,
      ['ios-token'],
      {
        title: 'Quiet',
        body: 'You have new activity',
        data: { teamId: 'team-1' },
      },
      'ios',
    )
    expect(sendMulticast).toHaveBeenNthCalledWith(
      2,
      ['android-token'],
      { data: { teamId: 'team-1' } },
      'android',
    )
  })
})
