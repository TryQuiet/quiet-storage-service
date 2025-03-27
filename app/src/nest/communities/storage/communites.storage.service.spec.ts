import { Test, type TestingModule } from '@nestjs/testing'
import { CommunitiesStorageService } from './communities.storage.service.js'
import { CommunitiesModule } from '../communities.module.js'
import { StorageModule } from '../../storage/storage.module.js'
import { ConfigModule } from '../../utils/config/config.module.js'
import type { EncryptedCommunity, EncryptedCommunityUpdate } from '../types.js'
import { SodiumHelper } from '../../encryption/sodium.helper.js'
import { EncryptionModule } from '../../encryption/enc.module.js'
import * as uint8arrays from 'uint8arrays'
import _ from 'lodash'

describe('CommunitesStorageService', () => {
  let communitesStorageService: CommunitiesStorageService | undefined =
    undefined
  let sodiumHelper: SodiumHelper | undefined = undefined
  let module: TestingModule | undefined = undefined

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        CommunitiesModule,
        StorageModule,
        ConfigModule,
        EncryptionModule,
      ],
    }).compile()
    await module.init()

    communitesStorageService = module.get<CommunitiesStorageService>(
      CommunitiesStorageService,
    )
    sodiumHelper = module.get<SodiumHelper>(SodiumHelper)
  })

  afterEach(async () => {
    await communitesStorageService?.clearRepository()
    await module?.close()
  })

  it('should be defined', () => {
    expect(module).toBeDefined()
    expect(communitesStorageService).toBeDefined()
    expect(sodiumHelper).toBeDefined()
  })

  it('should write a community to postgres', async () => {
    const community: EncryptedCommunity = {
      teamId: 'foobar',
      name: 'foobar',
      psk: uint8arrays.toString(
        sodiumHelper!.sodium.randombytes_buf(32),
        'hex',
      ),
      peerList: uint8arrays.toString(
        sodiumHelper!.sodium.randombytes_buf(32),
        'hex',
      ),
      sigChain: uint8arrays.toString(
        sodiumHelper!.sodium.randombytes_buf(256),
        'hex',
      ),
    }
    expect(await communitesStorageService?.addCommunity(community)).toBe(true)
  })

  it('should fail to write a community to postgres on duplicate ID', async () => {
    const teamId = 'foobar'
    const community: EncryptedCommunity = {
      teamId,
      name: 'foobar',
      psk: uint8arrays.toString(
        sodiumHelper!.sodium.randombytes_buf(32),
        'hex',
      ),
      peerList: uint8arrays.toString(
        sodiumHelper!.sodium.randombytes_buf(32),
        'hex',
      ),
      sigChain: uint8arrays.toString(
        sodiumHelper!.sodium.randombytes_buf(256),
        'hex',
      ),
    }
    expect(await communitesStorageService?.addCommunity(community)).toBe(true)
    const communityWithDupeId: EncryptedCommunity = {
      teamId,
      name: 'anotherone',
      psk: uint8arrays.toString(
        sodiumHelper!.sodium.randombytes_buf(32),
        'hex',
      ),
      peerList: uint8arrays.toString(
        sodiumHelper!.sodium.randombytes_buf(32),
        'hex',
      ),
      sigChain: uint8arrays.toString(
        sodiumHelper!.sodium.randombytes_buf(256),
        'hex',
      ),
    }
    expect(
      await communitesStorageService?.addCommunity(communityWithDupeId),
    ).toBe(false)
  })

  it('should write and then get a community from postgres', async () => {
    const community: EncryptedCommunity = {
      teamId: 'foobar',
      name: 'foobar',
      psk: uint8arrays.toString(
        sodiumHelper!.sodium.randombytes_buf(32),
        'hex',
      ),
      peerList: uint8arrays.toString(
        sodiumHelper!.sodium.randombytes_buf(32),
        'hex',
      ),
      sigChain: uint8arrays.toString(
        sodiumHelper!.sodium.randombytes_buf(256),
        'hex',
      ),
    }
    expect(await communitesStorageService?.addCommunity(community)).toBe(true)
    expect(
      _.isEqual(
        await communitesStorageService?.getCommunity(community.teamId),
        community,
      ),
    ).toBe(true)
  })

  it('should write and then update a community on postgres', async () => {
    const community: EncryptedCommunity = {
      teamId: 'foobar',
      name: 'foobar',
      psk: uint8arrays.toString(
        sodiumHelper!.sodium.randombytes_buf(32),
        'hex',
      ),
      peerList: uint8arrays.toString(
        sodiumHelper!.sodium.randombytes_buf(32),
        'hex',
      ),
      sigChain: uint8arrays.toString(
        sodiumHelper!.sodium.randombytes_buf(256),
        'hex',
      ),
    }
    expect(await communitesStorageService?.addCommunity(community)).toBe(true)
    const updates: EncryptedCommunityUpdate = {
      name: 'barbaz',
    }
    expect(
      await communitesStorageService?.updateCommunity(
        community.teamId,
        updates,
      ),
    ).toBe(true)
  })

  it("should fail to update a community on postgres when community doesn't exist", async () => {
    const updates: EncryptedCommunityUpdate = {
      name: 'barbaz',
    }
    expect(
      await communitesStorageService?.updateCommunity('foobar', updates),
    ).toBe(false)
  })
})
