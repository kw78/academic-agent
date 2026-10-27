import {
  parseCommand,
  type Clock,
  type DomainCommand,
  type IdGenerator,
} from '@academic/contracts'
import { createAcademicStore, type AcademicStore } from '@academic/storage-sqlite'

export interface TestClock extends Clock {
  advance(milliseconds: number): void
  set(iso: string): void
}

export function fixedClock(start = '2026-10-27T10:00:00.000Z'): TestClock {
  let current = Date.parse(start)
  return {
    now: () => new Date(current).toISOString(),
    advance: (milliseconds) => {
      current += milliseconds
    },
    set: (iso) => {
      current = Date.parse(iso)
    },
  }
}

export function sequentialIds(prefix = 'event'): IdGenerator {
  let counter = 0
  return { next: () => `${prefix}-${++counter}` }
}

export function createTestStore(options: {
  databasePath?: string
  clock?: TestClock
} = {}): AcademicStore {
  return createAcademicStore({
    databasePath: options.databasePath ?? ':memory:',
    clock: options.clock ?? fixedClock(),
    ids: sequentialIds(),
  })
}

let commandCounter = 0

export function makeCommand(
  type: string,
  aggregateId: string,
  payload: Record<string, unknown>,
  overrides: {
    commandId?: string
    correlationId?: string
    expectedVersion?: number
    actor?: { kind: 'user' | 'automation' | 'agent' | 'system'; id: string }
  } = {},
): DomainCommand {
  return parseCommand({
    commandId: overrides.commandId ?? `command-${++commandCounter}`,
    type,
    aggregateId,
    correlationId: overrides.correlationId ?? 'correlation-1',
    actor: overrides.actor ?? { kind: 'system', id: 'test-runner' },
    ...(overrides.expectedVersion !== undefined
      ? { expectedVersion: overrides.expectedVersion }
      : {}),
    payload,
  })
}

export async function execute(
  store: AcademicStore,
  command: DomainCommand,
) {
  return store.commands.execute(command)
}

export function countRows(store: AcademicStore, table: string): number {
  const row = store.database
    .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
    .get() as { count: number }
  return Number(row.count)
}
