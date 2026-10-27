import type { UiFailure } from '../protocol.js'

export type ViewState =
  | 'loading'
  | 'empty'
  | 'ready'
  | 'stale'
  | 'degraded'
  | 'auth-required'
  | 'conflict'
  | 'unavailable'
  | 'error'

export interface LoadState<T> {
  data?: T
  loading: boolean
  stale: boolean
  failure?: UiFailure
  updatedAt?: string
}

export function initialLoad<T>(): LoadState<T> {
  return { loading: true, stale: false }
}

export function beginLoad<T>(previous: LoadState<T>): LoadState<T> {
  return {
    ...previous,
    loading: true,
  }
}

export function loadSuccess<T>(value: T, updatedAt: string): LoadState<T> {
  return {
    data: value,
    loading: false,
    stale: false,
    updatedAt,
  }
}

function failureState(failure: UiFailure): ViewState {
  switch (failure.code) {
    case 'UNAVAILABLE':
      return 'unavailable'
    case 'AUTH_REQUIRED':
      return 'auth-required'
    case 'CONFLICT':
      return 'conflict'
    case 'VALIDATION':
    case 'CAPABILITY_UNAVAILABLE':
      return 'degraded'
    default:
      return 'error'
  }
}

export function loadFailure<T>(
  previous: LoadState<T>,
  failure: UiFailure,
  updatedAt = new Date().toISOString(),
): LoadState<T> {
  return {
    ...previous,
    loading: false,
    stale: previous.data !== undefined,
    failure,
    updatedAt: previous.updatedAt ?? updatedAt,
  }
}

function dataFailureState(failure: UiFailure): ViewState {
  switch (failure.code) {
    case 'UNAVAILABLE':
      return 'unavailable'
    case 'AUTH_REQUIRED':
      return 'auth-required'
    case 'CONFLICT':
      return 'conflict'
    default:
      return 'stale'
  }
}

export function viewState<T>(
  state: LoadState<T>,
  isEmpty?: (value: T) => boolean,
): ViewState {
  if (state.loading && state.data === undefined) return 'loading'
  if (state.failure && state.data === undefined) return failureState(state.failure)
  if (state.failure) return dataFailureState(state.failure)
  if (state.data !== undefined && isEmpty?.(state.data)) return 'empty'
  return 'ready'
}

export function isStale<T>(state: LoadState<T>): boolean {
  return state.data !== undefined && (state.stale || state.failure !== undefined)
}
