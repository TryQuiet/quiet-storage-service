import '@dotenvx/dotenvx/config' // load config from .env* file(s)
import type { EnvVars } from './env_vars.js'
import { Injectable } from '@nestjs/common'

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
    key: string | EnvVars,
    defaultValue?: T[],
  ): T[] | undefined {
    const stringValue = this.getString(key)
    if (stringValue == null || stringValue === '') {
      return defaultValue
    }

    const splitValue = stringValue.split(',')
    return splitValue.map(val => val as T)
  }
}
