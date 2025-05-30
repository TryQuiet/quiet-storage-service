import { Migration } from '@mikro-orm/migrations'

export class Migration20250530164720 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "communities" drop column "name", drop column "psk", drop column "peer_list";`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table "communities" add column "name" varchar(255) not null, add column "psk" bytea not null, add column "peer_list" bytea not null;`,
    )
  }
}
