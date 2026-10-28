import {
  systemClock,
  type CheckpointStore,
  type Clock,
  type DisposableRegistration,
  type DomainEvent,
  type EventLogReader,
  type EventType,
} from '@academic/contracts'

export type ConsumerStartPosition = 'beginning' | 'latest' | number

export interface ConsumerRegistration {
  consumerId: string
  eventTypes: readonly EventType[] | '*'
  projectionVersion: number
  startPosition: ConsumerStartPosition
  handler(event: DomainEvent): void | Promise<void>
  onReset?(): void | Promise<void>
}

export interface ConsumerStatus {
  consumerId: string
  lastPosition: number
  projectionVersion: number
  processedEvents: number
  consecutiveFailures: number
  lastError?: string
  nextRetryAt?: string
  lastRunAt?: string
}

export interface DispatchSummary {
  scanned: number
  processed: number
  failures: number
}

interface ActiveConsumer {
  config: ConsumerRegistration
  status: ConsumerStatus
  disposed: boolean
}

export interface EventDispatcherOptions {
  events: EventLogReader
  checkpoints: CheckpointStore
  clock?: Clock
  batchSize?: number
  onError?(consumerId: string, error: unknown): void
}

const DEFAULT_BATCH_SIZE = 100
const BASE_RETRY_DELAY_MS = 1_000
const MAX_RETRY_DELAY_MS = 60_000

export class EventDispatcher {
  readonly #events: EventLogReader
  readonly #checkpoints: CheckpointStore
  readonly #clock: Clock
  readonly #batchSize: number
  readonly #onError?: (consumerId: string, error: unknown) => void
  readonly #consumers = new Map<string, ActiveConsumer>()
  #timer: ReturnType<typeof setInterval> | undefined
  #running = false
  #processing: Promise<DispatchSummary> | undefined
  #queued: Promise<unknown> = Promise.resolve()

  constructor(options: EventDispatcherOptions) {
    this.#events = options.events
    this.#checkpoints = options.checkpoints
    this.#clock = options.clock ?? systemClock
    this.#batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE
    this.#onError = options.onError
  }

  async register(consumer: ConsumerRegistration): Promise<DisposableRegistration> {
    if (this.#consumers.has(consumer.consumerId)) {
      throw new Error(`Consumer already registered: ${consumer.consumerId}`)
    }
    const existing = await this.#checkpoints.getCheckpoint(consumer.consumerId)
    const maxPosition = await this.#events.maxPosition()
    const start = this.#resolveStart(consumer.startPosition, maxPosition)

    // startPosition is an installation/version policy, not a restart policy.
    // An existing compatible checkpoint always resumes so events committed while
    // the consumer was stopped are not skipped.
    const versionMismatch =
      existing !== undefined &&
      existing.projectionVersion !== consumer.projectionVersion
    const mustInitialize = !existing || versionMismatch

    if (mustInitialize) {
      if (versionMismatch && consumer.onReset) {
        await consumer.onReset()
      }
      await this.#checkpoints.setCheckpoint({
        consumerId: consumer.consumerId,
        lastPosition: start,
        projectionVersion: consumer.projectionVersion,
        updatedAt: this.#clock.now(),
      })
    }

    const entry: ActiveConsumer = {
      config: consumer,
      status: {
        consumerId: consumer.consumerId,
        lastPosition: mustInitialize ? start : existing!.lastPosition,
        projectionVersion: consumer.projectionVersion,
        processedEvents: 0,
        consecutiveFailures: 0,
      },
      disposed: false,
    }
    this.#consumers.set(consumer.consumerId, entry)

    return {
      dispose: () => {
        if (entry.disposed) return
        entry.disposed = true
        this.#consumers.delete(consumer.consumerId)
      },
    }
  }

  listConsumers(): ConsumerStatus[] {
    return [...this.#consumers.values()].map((entry) => ({ ...entry.status }))
  }

  isRunning(): boolean {
    return this.#running
  }

  start(intervalMs = 1_000): void {
    if (this.#running) return
    this.#running = true
    this.#timer = setInterval(() => {
      void this.processOnce().catch(() => undefined)
    }, intervalMs)
    this.#timer.unref?.()
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer)
    this.#timer = undefined
    this.#running = false
  }

  close(): void {
    this.stop()
    for (const entry of this.#consumers.values()) entry.disposed = true
    this.#consumers.clear()
  }

  /** Resolves once queued and in-flight dispatch work has settled. */
  async waitForIdle(): Promise<void> {
    await this.#queued
    if (this.#processing) await this.#processing
  }

  wake(): void {
    if (!this.#running) return
    this.#queued = this.#queued.then(() => this.processOnce()).catch(() => undefined)
  }

  async processOnce(): Promise<DispatchSummary> {
    if (this.#processing) return this.#processing
    this.#processing = this.#processOnceInternal().finally(() => {
      this.#processing = undefined
    })
    return this.#processing
  }

  async resetConsumer(consumerId: string): Promise<void> {
    const entry = this.#consumers.get(consumerId)
    if (!entry) throw new Error(`Unknown consumer: ${consumerId}`)
    await entry.config.onReset?.()
    const maxPosition = await this.#events.maxPosition()
    const start = this.#resolveStart(entry.config.startPosition, maxPosition)
    await this.#checkpoints.setCheckpoint({
      consumerId,
      lastPosition: start,
      projectionVersion: entry.config.projectionVersion,
      updatedAt: this.#clock.now(),
    })
    entry.status.lastPosition = start
    entry.status.consecutiveFailures = 0
    entry.status.nextRetryAt = undefined
  }

  async #processOnceInternal(): Promise<DispatchSummary> {
    const summary: DispatchSummary = { scanned: 0, processed: 0, failures: 0 }
    for (const entry of this.#consumers.values()) {
      if (entry.disposed) continue
      const now = this.#clock.now()
      if (entry.status.nextRetryAt && entry.status.nextRetryAt > now) continue

      let checkpoint = await this.#checkpoints.getCheckpoint(entry.config.consumerId)
      if (!checkpoint || checkpoint.projectionVersion !== entry.config.projectionVersion) {
        await entry.config.onReset?.()
        const maxPosition = await this.#events.maxPosition()
        const start = this.#resolveStart(entry.config.startPosition, maxPosition)
        checkpoint = {
          consumerId: entry.config.consumerId,
          lastPosition: start,
          projectionVersion: entry.config.projectionVersion,
          updatedAt: now,
        }
        await this.#checkpoints.setCheckpoint(checkpoint)
      }

      entry.status.lastRunAt = now
      const events = await this.#events.readAll(checkpoint.lastPosition, this.#batchSize)
      for (const event of events) {
        // A plugin can be unloaded while its handler is awaiting; stop before
        // handing the next event to a consumer that no longer exists.
        if (entry.disposed) break
        summary.scanned += 1
        if (!this.#matches(entry.config.eventTypes, event.type)) {
          await this.#advance(entry, event.globalPosition)
          continue
        }
        try {
          await entry.config.handler(event)
          summary.processed += 1
          entry.status.processedEvents += 1
          entry.status.consecutiveFailures = 0
          entry.status.lastError = undefined
          entry.status.nextRetryAt = undefined
          await this.#advance(entry, event.globalPosition)
        } catch (error) {
          summary.failures += 1
          this.#recordFailure(entry, error)
          this.#onError?.(entry.config.consumerId, error)
          break
        }
      }
    }
    return summary
  }

  async #advance(entry: ActiveConsumer, position: number): Promise<void> {
    entry.status.lastPosition = position
    await this.#checkpoints.setCheckpoint({
      consumerId: entry.config.consumerId,
      lastPosition: position,
      projectionVersion: entry.config.projectionVersion,
      updatedAt: this.#clock.now(),
    })
  }

  #recordFailure(entry: ActiveConsumer, error: unknown): void {
    entry.status.consecutiveFailures += 1
    entry.status.lastError = error instanceof Error ? error.message : String(error)
    const delay = Math.min(
      MAX_RETRY_DELAY_MS,
      BASE_RETRY_DELAY_MS * 2 ** (entry.status.consecutiveFailures - 1),
    )
    entry.status.nextRetryAt = new Date(
      Date.parse(this.#clock.now()) + delay,
    ).toISOString()
  }

  #matches(filter: readonly EventType[] | '*', type: string): boolean {
    return filter === '*' || (filter as readonly string[]).includes(type)
  }

  #resolveStart(position: ConsumerStartPosition, maxPosition: number): number {
    if (position === 'latest') return maxPosition
    if (position === 'beginning') return 0
    return Math.max(0, Math.trunc(position))
  }
}
