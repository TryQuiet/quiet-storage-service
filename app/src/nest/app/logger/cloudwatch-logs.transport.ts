import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
  type InputLogEvent,
} from '@aws-sdk/client-cloudwatch-logs'
import TransportStream from 'winston-transport'

interface CloudWatchLogsTransportOptions {
  logGroupName: string
  logStreamName: string
  createLogGroup?: boolean
  createLogStream?: boolean
  submissionInterval?: number
  submissionRetryCount?: number
  batchSize?: number
  awsConfig?: {
    accessKeyId?: string
    secretAccessKey?: string
    region?: string
  }
  formatLog?: (item: {
    level: string
    message: string
    meta: Record<string, unknown>
  }) => string
}

interface WinstonLogInfo {
  level: string
  message: unknown
  [key: string]: unknown
}

const DEFAULT_SUBMISSION_INTERVAL = 2_000
const DEFAULT_SUBMISSION_RETRY_COUNT = 1
const DEFAULT_BATCH_SIZE = 20

export class CloudWatchLogsTransport extends TransportStream {
  private readonly client: CloudWatchLogsClient
  private readonly logGroupName: string
  private readonly logStreamName: string
  private readonly createLogGroup: boolean
  private readonly createLogStream: boolean
  private readonly submissionRetryCount: number
  private readonly batchSize: number
  private readonly formatLog: NonNullable<
    CloudWatchLogsTransportOptions['formatLog']
  >
  private readonly interval: NodeJS.Timeout
  private readonly queue: InputLogEvent[] = []
  private ensureTargetPromise: Promise<void> | undefined = undefined
  private flushing = false

  constructor(options: CloudWatchLogsTransportOptions) {
    super()

    this.logGroupName = options.logGroupName
    this.logStreamName = options.logStreamName
    this.createLogGroup = options.createLogGroup ?? false
    this.createLogStream = options.createLogStream ?? false
    this.submissionRetryCount =
      options.submissionRetryCount ?? DEFAULT_SUBMISSION_RETRY_COUNT
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE
    this.formatLog =
      options.formatLog ?? (item => CloudWatchLogsTransport.defaultFormat(item))
    this.client = new CloudWatchLogsClient({
      region: options.awsConfig?.region,
      credentials:
        options.awsConfig?.accessKeyId != null &&
        options.awsConfig.secretAccessKey != null
          ? {
              accessKeyId: options.awsConfig.accessKeyId,
              secretAccessKey: options.awsConfig.secretAccessKey,
            }
          : undefined,
    })

    this.interval = setInterval(() => {
      void this.flush()
    }, options.submissionInterval ?? DEFAULT_SUBMISSION_INTERVAL)
    this.interval.unref()
  }

  public override log(info: WinstonLogInfo, callback: () => void): void {
    const { level, message, ...meta } = info
    const event = {
      message: this.formatLog({
        level,
        message: CloudWatchLogsTransport.stringifyMessage(message),
        meta,
      }),
      timestamp: Date.now(),
    }

    this.queue.push(event)
    if (this.queue.length >= this.batchSize) {
      void this.flush()
    }

    setImmediate(() => {
      this.emit('logged', info)
      callback()
    })
  }

  public override close(): void {
    clearInterval(this.interval)
    void this.flush()
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return

    this.flushing = true
    const events = this.queue.splice(0, this.batchSize)
    try {
      await this.ensureTarget()
      await this.putEventsWithRetry(events)
    } catch (error) {
      this.queue.unshift(...events)
      this.emit('error', error)
    } finally {
      this.flushing = false
    }
  }

  private async ensureTarget(): Promise<void> {
    this.ensureTargetPromise ??= this.createTarget()
    await this.ensureTargetPromise
  }

  private async createTarget(): Promise<void> {
    if (this.createLogGroup) {
      await this.ignoreAlreadyExists(
        this.client.send(
          new CreateLogGroupCommand({ logGroupName: this.logGroupName }),
        ),
      )
    }

    if (this.createLogStream) {
      await this.ignoreAlreadyExists(
        this.client.send(
          new CreateLogStreamCommand({
            logGroupName: this.logGroupName,
            logStreamName: this.logStreamName,
          }),
        ),
      )
    }
  }

  private async putEventsWithRetry(events: InputLogEvent[]): Promise<void> {
    const sortedEvents = [...events].sort(
      (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0),
    )
    let lastError: unknown = undefined

    for (let attempt = 0; attempt <= this.submissionRetryCount; attempt++) {
      try {
        await this.client.send(
          new PutLogEventsCommand({
            logGroupName: this.logGroupName,
            logStreamName: this.logStreamName,
            logEvents: sortedEvents,
          }),
        )
        return
      } catch (error) {
        lastError = error
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`Failed to put CloudWatch log events`)
  }

  private async ignoreAlreadyExists(promise: Promise<unknown>): Promise<void> {
    try {
      await promise
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === 'ResourceAlreadyExistsException'
      ) {
        return
      }
      throw error
    }
  }

  private static defaultFormat(item: {
    level: string
    message: string
    meta: Record<string, unknown>
  }): string {
    return `${item.level}: ${item.message} ${JSON.stringify(item.meta)}`
  }

  private static stringifyMessage(message: unknown): string {
    if (typeof message === 'string') return message
    try {
      return JSON.stringify(message)
    } catch {
      return String(message)
    }
  }
}
