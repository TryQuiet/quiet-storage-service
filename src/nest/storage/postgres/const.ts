export const DEFAULT_POSTGRES_DB_NAME = 'qss'
export const DEFAULT_POSTGRES_DEBUG = false
export const DEFAULT_POSTGRES_PORT = 5432
export const DEFAULT_POSTGRES_HOST = 'localhost'
export const DEFAULT_POSTGRES_USERNAME = 'postgres'
export const DEFAULT_POSTGRES_PASSWORD = 'postgres'

export enum TableNames {
  Communities = 'communities',
}

export enum PostgresSources {
  Local = 'local',
  RDS = 'rds',
}
