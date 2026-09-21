import { Migration } from '@mikro-orm/migrations'

export class Migration20260921163000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      'create table "ci_enrollment_grants" ("id" varchar(64) not null, "expires_at" timestamptz not null, constraint "ci_enrollment_grants_pkey" primary key ("id"));',
    )
    this.addSql(
      'create index "ci_enrollment_grants_expires_at_index" on "ci_enrollment_grants" ("expires_at");',
    )
  }

  override async down(): Promise<void> {
    this.addSql('drop table "ci_enrollment_grants";')
  }
}
