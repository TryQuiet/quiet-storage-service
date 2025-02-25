import { Test, type TestingModule } from '@nestjs/testing'
import { CommunityService } from './community.service.js'

describe('CommunityService', () => {
  let service: CommunityService | undefined = undefined
  const id = '12345'
  const name = 'foobar'

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommunityService],
    }).compile()

    service = module.get<CommunityService>(CommunityService)
  })

  afterEach(() => {
    service?.clear()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('Create', () => {
    it('creates a community', () => {
      const community = service?.create({
        id,
        name,
      })
      expect(community?.id).toBe(id)
    })
  })

  describe('Find One', () => {
    beforeEach(() => {
      service?.create({ id, name })
    })

    it('finds a community by id', () => {
      const community = service?.findOne({ id })
      expect(community?.id).toBe(id)
    })

    it('finds a community by name', () => {
      const community = service?.findOne({ name })
      expect(community?.id).toBe(id)
    })

    it('returns undefined when no match found', () => {
      const community = service?.findOne({ id: '67890' })
      expect(community).toBeUndefined()
    })

    it('throws an error when no query is provided', () => {
      expect(() => service?.findOne({})).toThrow(
        'Must pass in an id or name to filter on',
      )
    })
  })

  describe('Remove', () => {
    beforeEach(() => {
      service?.create({ id, name })
    })

    it('removes a community by id', () => {
      const result = service?.remove({ id })
      expect(result).toBe(true)
    })

    it('removes a community by name', () => {
      const result = service?.remove({ name })
      expect(result).toBe(true)
    })

    it('returns false when community not found', () => {
      const result = service?.remove({ id: '67890' })
      expect(result).toBe(false)
    })

    it('throws an error when no query is provided', () => {
      expect(() => service?.remove({})).toThrow(
        'Must pass in an id or name to filter on',
      )
    })
  })
})
