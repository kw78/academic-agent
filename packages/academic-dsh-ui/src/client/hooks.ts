import { useCallback, useEffect, useRef, useState } from 'react'
import type { UiResult } from '../protocol.js'
import {
  beginLoad,
  initialLoad,
  loadFailure,
  loadSuccess,
  type LoadState,
} from './state.js'

export interface Notice {
  tone: 'ok' | 'error' | 'info'
  text: string
}

export function useLoad<T>(
  load: (signal: AbortSignal) => Promise<UiResult<T>>,
  active: boolean,
  intervalMs = 0,
): { state: LoadState<T>; refresh: () => Promise<UiResult<T> | undefined> } {
  const [state, setState] = useState<LoadState<T>>(() => initialLoad<T>())
  const loadRef = useRef(load)
  loadRef.current = load
  const inFlight = useRef<AbortController>()

  const refresh = useCallback(async (): Promise<UiResult<T> | undefined> => {
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    setState((previous) => beginLoad(previous))
    const result = await loadRef.current(controller.signal)
    if (controller.signal.aborted) return result
    if (result.ok) {
      setState(loadSuccess(result.value, new Date().toISOString()))
    } else {
      setState((previous) => loadFailure(previous, result.error))
    }
    return result
  }, [])

  useEffect(() => {
    if (!active) return undefined
    void refresh()
    const timer =
      intervalMs > 0
        ? window.setInterval(() => {
            if (document.visibilityState === 'visible') void refresh()
          }, intervalMs)
        : undefined
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      if (timer !== undefined) window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      inFlight.current?.abort()
    }
  }, [active, intervalMs, refresh])

  return { state, refresh }
}

export function useAction(onDone?: () => unknown | Promise<unknown>): {
  pending: string | undefined
  notice: Notice | undefined
  run: (
    label: string,
    action: () => Promise<UiResult<unknown>>,
    successText?: string,
  ) => Promise<boolean>
  setNotice: (notice: Notice | undefined) => void
} {
  const [pending, setPending] = useState<string>()
  const [notice, setNotice] = useState<Notice>()

  const run = useCallback(
    async (
      label: string,
      action: () => Promise<UiResult<unknown>>,
      successText = '已保存',
    ): Promise<boolean> => {
      setPending(label)
      setNotice(undefined)
      const result = await action()
      setPending(undefined)
      if (!result.ok) {
        setNotice({ tone: 'error', text: result.error.message })
        return false
      }
      setNotice({ tone: 'ok', text: successText })
      await onDone?.()
      return true
    },
    [onDone],
  )

  return { pending, notice, run, setNotice }
}
