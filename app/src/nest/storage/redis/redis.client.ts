import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { createLogger } from '../../app/logger/logger.js'
import { ConfigService } from '../../utils/config/config.service.js'
import { EnvVars } from '../../utils/config/env_vars.js'
import { Redis } from 'ioredis'
import * as uint8arrays from 'uint8arrays'

@Injectable()
export class RedisClient implements OnModuleInit, OnModuleDestroy {
  private readonly client: Redis | undefined
  private readonly endpoint: string | undefined
  private readonly port: number | undefined
  public readonly enabled: boolean

  private readonly logger = createLogger(`Storage:${RedisClient.name}`)

  constructor() {
    this.endpoint = ConfigService.getString(EnvVars.REDIS_ENDPOINT)
    this.port = ConfigService.getInt(EnvVars.REDIS_PORT)
    this.enabled = ConfigService.getBool(EnvVars.REDIS_ENABLED, false)!

    if (this.enabled) {
      this.logger.log(`Redis enabled!`)
      // if (this.port == null || this.endpoint == null) {
      //   throw new Error(
      //     `Must provide an endoint and port for redis when abled!`,
      //   )
      // }
      this.client = new Redis({
        port: this.port,
        host: this.endpoint,
        lazyConnect: true,
      })
    } else {
      this.client = undefined
    }
  }

  public async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      return
    }

    if (this.client == null) {
      throw new Error(`Redis is enabled but client is undefined!`)
    }

    this.logger.log(`Connecting to redis on ${this.endpoint}:${this.port}`)
    await this.client.connect()
  }

  public async get(key: string): Promise<string | null> {
    if (this.client == null) {
      throw new Error(`Redis is enabled but client is undefined!`)
    }

    return await this.client.get(key)
  }

  public async set(key: string, value: string | Uint8Array): Promise<void> {
    if (this.client == null) {
      throw new Error(`Redis is enabled but client is undefined!`)
    }

    const putValue =
      typeof value === 'string' ? value : uint8arrays.toString(value, 'base64')
    await this.client.set(key, putValue)
  }

  public async flush(): Promise<void> {
    if (this.client == null) {
      throw new Error(`Redis is enabled but client is undefined!`)
    }

    await this.client.flushdb()
  }

  public get initialized(): boolean {
    return this.client != null && this.client.status === 'ready'
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- consistency
  public async close(): Promise<void> {
    this.client?.disconnect(false)
  }

  public async onModuleDestroy(): Promise<void> {
    await this.close()
  }
}
