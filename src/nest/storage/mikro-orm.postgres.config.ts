import { defineConfig } from '@mikro-orm/core'
import { TSMigrationGenerator } from '@mikro-orm/migrations'
import { PostgreSqlDriver } from '@mikro-orm/postgresql'
import { TsMorphMetadataProvider } from '@mikro-orm/reflection'

export default defineConfig({
  connect: true,
  driver: PostgreSqlDriver,
  entities: [`dist/src/nest/storage/communities/entities/*.entity.js`],
  entitiesTs: [`src/nest/storage/communities/entities/*.entity.ts`],
  metadataProvider: TsMorphMetadataProvider,
  colors: true,
  verbose: true,
  ensureDatabase: true,
  allowGlobalContext: true,
  baseDir: process.cwd(),
  preferTs: process.env.MIGRATE_TS === 'true',
  migrations: {
    tableName: 'mikro_orm_migrations', // name of database table with log of executed transactions
    path:
      process.env.MIGRATE_TS === 'true'
        ? 'src/migrations'
        : 'dist/src/migrations', // path to the folder with migrations
    pathTs: undefined, // path to the folder with TS migrations (if used, you should put path to compiled files in `path`)
    glob: '!(*.d).{js,ts}', // how to match migration files (all .js and .ts files, but not .d.ts)
    transactional: true, // wrap each migration in a transaction
    disableForeignKeys: true, // wrap statements with `set foreign_key_checks = 0` or equivalent
    allOrNothing: true, // wrap all migrations in master transaction
    dropTables: true, // allow to disable table dropping
    safe: false, // allow to disable table and column dropping
    snapshot: true, // save snapshot when creating new migrations
    emit: 'ts', // migration generation mode
    generator: TSMigrationGenerator, // migration generator, e.g. to allow custom formatting
  },
})
