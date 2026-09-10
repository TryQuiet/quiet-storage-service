import { Migration } from '@mikro-orm/migrations'

/**
 * Record which team keyring a community's graph was committed with.
 *
 * The graph is in PostgreSQL and the keyring is in the secrets manager, with no shared
 * transaction, so nothing tied the two together. Existing rows keep a null digest: they were
 * written before the digest existed and there is no way to reconstruct it.
 */
export class Migration20260903180000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table "communities" add column "team_keyring_digest" varchar(255) null;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`alter table "communities" drop column "team_keyring_digest";`)
  }
}
