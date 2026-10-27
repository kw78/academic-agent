import type { Context } from '@deepseek-ai/cordis'
import type { UiErrorCode, UiFailure, UiResult } from '../protocol.js'

function mapRpcCode(code: string | undefined): UiErrorCode {
  switch (code) {
    case 'gateway/input-invalid':
      return 'VALIDATION'
    case 'gateway/cancelled':
    case 'gateway/peer-disposed':
      return 'UNAVAILABLE'
    case 'gateway/invocation-unavailable':
    case 'gateway/binding-invalid':
    case 'gateway/method-unavailable':
      return 'UNAVAILABLE'
    case 'remote-access/denied':
      return 'FORBIDDEN'
    default:
      return 'ERROR'
  }
}

function failure(error: UiFailure): UiResult<never> {
  return { ok: false, error }
}

/**
 * The UI reaches the Academic Host only through the authenticated DSH Remote
 * carrier. It never opens a database, reads a vault or starts a second runtime.
 */
export async function callApi<T>(
  ctx: Context,
  method: string,
  request: unknown = {},
  signal?: AbortSignal,
): Promise<UiResult<T>> {
  const rpc = ctx.connection?.rpc
  if (!rpc?.call) {
    return failure({ code: 'UNAVAILABLE', message: 'DSH Host 连接不可用' })
  }
  try {
    const response = await rpc.call(
      '/api',
      `academic/${method}`,
      { args: { request } },
      signal,
    )
    if (!response.ok) {
      return failure({
        code: mapRpcCode(response.error?.code),
        message: response.error?.message ?? 'Host 请求失败',
      })
    }
    return response.value as UiResult<T>
  } catch {
    return failure({
      code: 'UNAVAILABLE',
      message: '无法连接 Academic Host，请确认 Host 插件已加载',
    })
  }
}
