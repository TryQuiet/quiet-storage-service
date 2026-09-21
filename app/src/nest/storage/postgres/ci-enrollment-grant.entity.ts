import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/core'

@Entity({ tableName: 'ci_enrollment_grants' })
export class CiEnrollmentGrantEntity {
  @PrimaryKey({ type: 'string', length: 64 })
  id!: string

  @Index()
  @Property({ type: 'Date' })
  expiresAt!: Date
}
