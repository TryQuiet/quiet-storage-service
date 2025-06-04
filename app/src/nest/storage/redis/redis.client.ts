/**
 * Redis client wrapper service
 *
 * NOTE: As of 2025-06-04 this is only used to mock the AWS secrets manager in local environments.
 */
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { createLogger } from '../../app/logger/logger.js'
import { ConfigService } from '../../utils/config/config.service.js'
import { EnvVars } from '../../utils/config/env_vars.js'
import { Redis } from 'ioredis'
import * as uint8arrays from 'uint8arrays'

@Injectable()
export class RedisClient implements OnModuleInit, OnModuleDestroy {
  /**
   * Redis client instance
   */
  private readonly client: Redis | undefined
  /**
   * Redis endpoint string
   */
  private readonly endpoint: string | undefined
  /**
   * Port that Redis is running on
   */
  private readonly port: number | undefined
  /**
   * True when Redis should connect
   */
  public readonly enabled: boolean

  private readonly logger = createLogger(`Storage:${RedisClient.name}`)

  constructor() {
    this.endpoint = ConfigService.getString(EnvVars.REDIS_ENDPOINT)
    this.port = ConfigService.getInt(EnvVars.REDIS_PORT)
    this.enabled = ConfigService.getBool(EnvVars.REDIS_ENABLED, false)!

    // check if Redis is configured and connect the client if true
    if (this.enabled) {
      this.logger.log(`Redis enabled!`)
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

  /**
   * Fetch a string key from Redis
   *
   * @param key Key to fetch from Redis
   * @returns Found value or null
   */
  public async get(key: string): Promise<string | null> {
    if (this.client == null) {
      throw new Error(`Redis is enabled but client is undefined!`)
    }

    return await this.client.get(key)
  }

  /**
   * Set a string key in Redis
   *
   * @param key Key to set in Redis
   * @param value Value to set for this key
   */
  public async set(key: string, value: string | Uint8Array): Promise<void> {
    if (this.client == null) {
      throw new Error(`Redis is enabled but client is undefined!`)
    }

    // convert byte values into base64 strings
    const putValue =
      typeof value === 'string' ? value : uint8arrays.toString(value, 'base64')
    await this.client.set(key, putValue)
  }

  /**
   * Delete all keys from the configured Redis DB
   */
  public async flush(): Promise<void> {
    if (this.client == null) {
      throw new Error(`Redis is enabled but client is undefined!`)
    }

    await this.client.flushdb()
  }

  /**
   * Check status of Redis client connection
   */
  public get initialized(): boolean {
    return this.client != null && this.client.status === 'ready'
  }

  /**
   * Close Redis client connection
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- consistency
  public async close(): Promise<void> {
    this.client?.disconnect(false)
  }

  public async onModuleDestroy(): Promise<void> {
    await this.close()
  }
}
