import { BaseEntity, Entity, PrimaryKey, Property } from '@mikro-orm/core'

@Entity()
export class Community extends BaseEntity {
  @PrimaryKey()
  id!: string

  @Property()
  name!: string

  @Property()
  psk!: string

  @Property({ type: 'array' })
  peerList!: string[]

  @Property({ type: 'bytea' })
  sigChain!: Uint8Array | string
}
