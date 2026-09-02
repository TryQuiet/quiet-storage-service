import { jest } from '@jest/globals'
import { QPSService } from './qps.service.js'
import type { UcanService } from './ucan/ucan.service.js'
import type { PushService } from './push/push.service.js'

describe('QPSService', () => {
  const createUcan = jest.fn<UcanService['createUcan']>()
  const validateUcan = jest.fn<UcanService['validateUcan']>()
  const isAvailable = jest.fn<PushService['isAvailable']>()
  const send = jest.fn<PushService['send']>()
  const sendMulticast = jest.fn<PushService['sendMulticast']>()

  const ucanService: Pick<UcanService, 'createUcan' | 'validateUcan'> = {
    createUcan,
    validateUcan,
  }

  const pushService: Pick<
    PushService,
    'isAvailable' | 'send' | 'sendMulticast'
  > = {
    isAvailable,
    send,
    sendMulticast,
  }

  let service: QPSService

  beforeEach(() => {
    jest.clearAllMocks()
    isAvailable.mockReturnValue(true)
    service = new QPSService(
      ucanService as unknown as UcanService,
      pushService as unknown as PushService,
    )
  })

  it('creates registration UCANs with platform and team ID', async () => {
    createUcan.mockResolvedValue('test-ucan')

    const result = await service.registerDevice(
      'device-token',
      'com.test.app',
      'android',
      'team-1',
    )

    expect(result).toEqual({ success: true, ucan: 'test-ucan' })
    expect(isAvailable).toHaveBeenCalledWith('android')
    expect(createUcan).toHaveBeenCalledWith(
      'device-token',
      'com.test.app',
      'android',
      'team-1',
    )
  })

  it('returns UCAN metadata for authorization checks', async () => {
    validateUcan.mockResolvedValue({
      valid: true,
      deviceToken: 'device-token',
      platform: 'ios',
      teamId: 'team-1',
    })

    await expect(service.validateUcan('test-ucan')).resolves.toEqual({
      valid: true,
      deviceToken: 'device-token',
      platform: 'ios',
      teamId: 'team-1',
    })
  })

  it('sends UCAN-bound data-only pushes to Android devices', async () => {
    validateUcan.mockResolvedValue({
      valid: true,
      deviceToken: 'android-token',
      platform: 'android',
      teamId: 'team-1',
    })
    send.mockResolvedValue({ success: true })

    await service.sendPush('test-ucan')

    expect(send).toHaveBeenCalledWith(
      'android-token',
      { data: { teamId: 'team-1' } },
      'android',
    )
  })

  it('uses fixed fallback notification content for iOS devices', async () => {
    validateUcan.mockResolvedValue({
      valid: true,
      deviceToken: 'ios-token',
      platform: 'ios',
      teamId: 'team-1',
    })
    send.mockResolvedValue({ success: true })

    await service.sendPush('test-ucan')

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
        teamId: 'team-1',
      })
      .mockResolvedValueOnce({
        valid: true,
        deviceToken: 'android-token',
        platform: 'android',
        teamId: 'team-1',
      })
    sendMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      invalidTokens: [],
    })

    await service.sendBatchPush(['ios-ucan', 'android-ucan'])

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

  it('keeps each recipient in the team bound into its UCAN', async () => {
    validateUcan
      .mockResolvedValueOnce({
        valid: true,
        deviceToken: 'team-a-token',
        platform: 'ios',
        teamId: 'team-a',
      })
      .mockResolvedValueOnce({
        valid: true,
        deviceToken: 'team-b-token',
        platform: 'ios',
        teamId: 'team-b',
      })
    sendMulticast.mockResolvedValue({
      successCount: 1,
      failureCount: 0,
      invalidTokens: [],
    })

    await service.sendBatchPush(['team-a-ucan', 'team-b-ucan'])

    expect(sendMulticast).toHaveBeenNthCalledWith(
      1,
      ['team-a-token'],
      {
        title: 'Quiet',
        body: 'You have new activity',
        data: { teamId: 'team-a' },
      },
      'ios',
    )
    expect(sendMulticast).toHaveBeenNthCalledWith(
      2,
      ['team-b-token'],
      {
        title: 'Quiet',
        body: 'You have new activity',
        data: { teamId: 'team-b' },
      },
      'ios',
    )
  })
})
