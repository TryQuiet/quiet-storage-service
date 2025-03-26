import { Migration } from '@mikro-orm/migrations'

export class Migration20250325192749 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "communities" alter column "psk" type bytea using ("psk"::bytea);`,
    )
    this.addSql(
      `alter table "communities" alter column "peer_list" type bytea using ("peer_list"::bytea);`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "communities" alter column "psk" type varchar(255) using ("psk"::varchar(255));`,
    )
    this.addSql(
      `alter table "communities" alter column "peer_list" type varchar(255) using ("peer_list"::varchar(255));`,
    )
  }
}
