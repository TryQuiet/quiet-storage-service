import { defineConfig, ReflectMetadataProvider } from '@mikro-orm/core'
import { TSMigrationGenerator } from '@mikro-orm/migrations'
import { PostgreSqlDriver } from '@mikro-orm/postgresql'
import { TsMorphMetadataProvider } from '@mikro-orm/reflection'
import { ConfigService } from '../../utils/config/config.service.js'
import { EnvVars } from '../../utils/config/env_vars.js'
import { PostgresSources } from './const.js'
import { AWSSecretsService } from '../../utils/aws/aws-secrets.service.js'
import { Environment } from '../../utils/config/types.js'
import { AWSSecretNames } from '../../utils/aws/const.js'
import type { RDSCredentials } from '../../utils/aws/types.js'
import type { ConnectionOptions } from 'tls'
import { Community } from '../../communities/storage/entities/community.entity.js'
import { createLogger } from '../../app/logger/logger.js'

const configService = ConfigService.instance
const logger = createLogger('MikroORM')

const getRdsPassword = async (): Promise<string | undefined> => {
  const postgresSource = configService.getString(EnvVars.POSTGRES_SOURCE)
  if (postgresSource === PostgresSources.RDS) {
    const awsSecretsService = new AWSSecretsService(configService)
    let secretName: string | undefined = undefined
    switch (configService.getEnv()) {
      case Environment.Development:
        secretName = AWSSecretNames.RDSCredentials_Dev
        break
      case Environment.Production:
        secretName = AWSSecretNames.RDSCredentials_Prod
        break
      default:
        secretName = undefined
    }

    if (secretName == null) {
      throw new Error(
        `Expected environment to be ${Environment.Development} or ${Environment.Production} when postgres environment is ${postgresSource}`,
      )
    }
    const credentials =
      await awsSecretsService.getSecret<RDSCredentials>(secretName)
    if (credentials == null) {
      throw new Error(
        `No credentials found in AWS secrets manager for key ${secretName}!`,
      )
    }
    return credentials.password
  }

  return undefined
}

const getPassword = async (): Promise<string | undefined> => {
  const postgresSource = configService.getString(EnvVars.POSTGRES_SOURCE)
  let postgresPassword = configService.getString(EnvVars.MIKRO_ORM_PASSWORD)
  if (postgresSource === PostgresSources.RDS) {
    postgresPassword = await getRdsPassword()
  }
  return postgresPassword
}

const getReplicaConfigs = (): ConnectionOptions[] | undefined => {
  const replicaHosts = configService.getList(
    'string',
    EnvVars.POSTGRES_READ_REPLICA_HOSTS,
  )
  return replicaHosts != null
    ? replicaHosts.map(
        host =>
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- not sure why this complains
          ({
            host,
            port: configService.getInt(EnvVars.MIKRO_ORM_PORT),
          }) as ConnectionOptions,
      )
    : undefined
}

const preferTs = configService.getBool(EnvVars.MIKRO_ORM_PREFER_TS) ?? false

export default defineConfig({
  dbName: configService.getString(EnvVars.MIKRO_ORM_DB_NAME),
  host: configService.getString(EnvVars.MIKRO_ORM_HOST),
  port: configService.getInt(EnvVars.MIKRO_ORM_PORT),
  user: configService.getString(EnvVars.MIKRO_ORM_USER),
  password: await getPassword(),
  replicas: getReplicaConfigs(),
  connect: true,
  driver: PostgreSqlDriver,
  entities: [Community],
  metadataProvider: preferTs
    ? TsMorphMetadataProvider
    : ReflectMetadataProvider,
  colors: true,
  verbose: true,
  ensureDatabase: true,
  allowGlobalContext: true,
  baseDir: process.cwd(),
  preferTs,
  logger: (message: string): void => {
    logger.debug(message)
  },
  debug: true,
  migrations: {
    tableName: 'mikro_orm_migrations', // name of database table with log of executed transactions
    path: 'dist/src/migrations', // path to the folder with migrations
    pathTs: 'src/migrations', // path to the folder with TS migrations (if used, you should put path to compiled files in `path`)
    glob: '!(*.d).{js,ts}', // how to match migration files (all .js and .ts files, but not .d.ts)
    transactional: true, // wrap each migration in a transaction
    disableForeignKeys: true, // wrap statements with `set foreign_key_checks = 0` or equivalent
    allOrNothing: true, // wrap all migrations in master transaction
    dropTables: true, // allow to disable table dropping
    safe: false, // allow to disable table and column dropping
    snapshot: true, // save snapshot when creating new migrations
    emit: 'ts', // migration generation mode
    generator: preferTs ? TSMigrationGenerator : undefined, // migration generator, e.g. to allow custom formatting
  },
})
