import { Migration } from '@mikro-orm/migrations'

export class Migration20250325191022 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "communities" alter column "peer_list" type varchar(255) using ("peer_list"::varchar(255));`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "communities" alter column "peer_list" type text[] using ("peer_list"::text[]);`,
    )
  }
}
