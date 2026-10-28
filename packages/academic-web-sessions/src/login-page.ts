export interface LoginPageInput {
  finalUrl: string
  body: string
  contentType?: string
  /** User-supplied hints; applied to the final URL and page title only. */
  patterns?: unknown
}

const LOGIN_PATH = /\/login|\/signin|\/cas\/login/i
const LOGIN_TITLE = /登录|sign in|log in/i
const LOGIN_FORM = /name=["']login["']|id=["']loginForm["']/i

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function isJsonBody(body: string, contentType?: string): boolean {
  const type = contentType?.toLowerCase() ?? ''
  if (type.includes('json')) return true
  const head = body.trimStart().slice(0, 64)
  return head.startsWith('{') || head.startsWith('[')
}

function isHtmlResponse(body: string, contentType?: string): boolean {
  const type = contentType?.toLowerCase() ?? ''
  if (type.includes('html')) return true
  if (type.includes('json') || type.includes('javascript') || type.includes('ecmascript')) {
    return false
  }
  // Some portals serve HTML as text/plain; the body shape decides then.
  return /^\s*<(!doctype|html|head|body|meta|title|form|div)\b/i.test(
    body.slice(0, 512),
  )
}

/**
 * Login detection is only meaningful for rendered pages. API paths such as
 * /gateway/.../login/getUserInfo are JSON endpoints, not expired sessions, so
 * URL/blob heuristics must never classify them as logged out.
 */
export function loginPageSignals(input: LoginPageInput): boolean {
  if (isJsonBody(input.body, input.contentType)) return false
  if (!isHtmlResponse(input.body, input.contentType)) return false
  if (LOGIN_PATH.test(input.finalUrl)) return true
  const title = decodeEntities(
    /<title[^>]*>([\s\S]*?)<\/title>/i.exec(input.body)?.[1] ?? '',
  )
  if (LOGIN_TITLE.test(title)) return true
  if (LOGIN_FORM.test(input.body.slice(0, 20_000))) return true
  if (!Array.isArray(input.patterns)) return false
  const haystack = `${input.finalUrl}\n${title}`
  return input.patterns.some((pattern) => {
    if (typeof pattern !== 'string') return false
    try {
      return new RegExp(pattern).test(haystack)
    } catch {
      return false
    }
  })
}
