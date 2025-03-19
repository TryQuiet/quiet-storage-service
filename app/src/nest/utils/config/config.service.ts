import '@dotenvx/dotenvx/config' // load config from .env* file(s)
import { EnvVars } from './env_vars.js'
import { Injectable } from '@nestjs/common'
import { Environment, EnvironmentShort } from './types.js'

@Injectable()
export class ConfigService {
  private static _instance: ConfigService | undefined = undefined

  private constructor() {
    // do nothing
  }

  public static get instance(): ConfigService {
    ConfigService._instance ??= new ConfigService()
    return ConfigService._instance
  }

  public getEnv(): Environment {
    const value = this.getString(EnvVars.ENV)
    if (value == null) {
      throw new Error(`ENV is not set!`)
    }

    switch (value.toLowerCase()) {
      case 'dev':
      case 'development':
        return Environment.Development
      case 'prod':
      case 'production':
        return Environment.Production
      case 'test':
      case 'testing':
        return Environment.Test
      case 'local':
        return Environment.Local
      default:
        throw new Error(`Invalid ENV value ${value}`)
    }
  }

  public getEnvShort(): EnvironmentShort {
    switch (this.getEnv()) {
      case Environment.Development:
        return EnvironmentShort.Dev
      case Environment.Production:
        return EnvironmentShort.Prod
      case Environment.Local:
        return EnvironmentShort.Local
      case Environment.Test:
        return EnvironmentShort.Test
    }
  }

  public getString(
    key: string | EnvVars,
    defaultValue?: string,
  ): string | undefined {
    const rawValue = process.env[key]
    if (rawValue == null || rawValue === '') {
      return defaultValue
    }
    return rawValue
  }

  public getInt(
    key: string | EnvVars,
    defaultValue?: number,
  ): number | undefined {
    const stringValue = this.getString(key)
    if (stringValue == null || stringValue === '') {
      return defaultValue
    }

    return parseInt(stringValue)
  }

  public getBool(
    key: string | EnvVars,
    defaultValue?: boolean,
  ): boolean | undefined {
    const stringValue = this.getString(key)
    if (stringValue == null || stringValue === '') {
      return defaultValue
    }

    return stringValue === 'true'
  }

  public getList<T = string | number | boolean>(
    type: 'string' | 'number' | 'boolean',
    key: string | EnvVars,
    defaultValue?: T[],
  ): T[] | undefined {
    const stringValue = this.getString(key)
    if (stringValue == null || stringValue === '') {
      return defaultValue
    }

    const splitValue = stringValue.split(',')
    let convert: (val: string) => unknown = (val: string) => val
    switch (type) {
      case 'string':
        break
      case 'number':
        convert = (val: string) => Number(val)
        break
      case 'boolean':
        convert = (val: string) => val === 'true'
        break
    }
    return splitValue.map(val => convert(val)) as T[]
  }
}
