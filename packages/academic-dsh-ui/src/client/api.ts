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
    return failure({
      code: 'UNAVAILABLE',
      message: 'DSH Host 连接尚未建立；请确认 DSH Host 已启动，恢复后会自动重试。',
    })
  }
  try {
    const response = await rpc.call(
      '/api',
      `academic/${method}`,
      { args: { request } },
      signal,
    )
    if (!response.ok) {
      const rpcCode = response.error?.code
      if (
        rpcCode === 'gateway/invocation-unavailable' ||
        rpcCode === 'gateway/binding-invalid' ||
        rpcCode === 'gateway/method-unavailable'
      ) {
        return failure({
          code: 'UNAVAILABLE',
          message:
            'Academic Host 未加载或版本不匹配：请确认 DSH 中 academic-host 与 academic-ui 插件已启用，然后刷新页面。',
        })
      }
      return failure({
        code: mapRpcCode(rpcCode),
        message: response.error?.message ?? 'Host 请求失败',
      })
    }
    return response.value as UiResult<T>
  } catch {
    return failure({
      code: 'UNAVAILABLE',
      message:
        '无法连接 Academic Host。请确认 DSH Host 仍在运行且 @academic/dsh-ui 已加载；恢复后会自动重试。',
    })
  }
}
