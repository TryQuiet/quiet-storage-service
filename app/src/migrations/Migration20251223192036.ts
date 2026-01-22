import { Migration } from '@mikro-orm/migrations'

export class Migration20251223192036 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "log_entry_sync" add column "hashed_db_id" varchar null;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "log_entry_sync" drop column "hashed_db_id";`)
  }
}
