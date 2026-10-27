import { chromium, type Browser, type BrowserContext } from 'playwright-core'

export const USTC_BLACKBOARD_LOGIN_URL = 'https://www.bb.ustc.edu.cn/'

export interface BlackboardLoginOptions {
  timeoutMs?: number
  channel?: 'msedge' | 'chrome'
}

export interface BlackboardLoginResult {
  cookieHeader: string
  cookieCount: number
  finalOrigin: string
  finalPath: string
  title?: string
}

function isBlackboardUrl(url: URL): boolean {
  return url.hostname === 'www.bb.ustc.edu.cn' || url.hostname.endsWith('.bb.ustc.edu.cn')
}

function isLoggedInUrl(url: URL): boolean {
  if (!isBlackboardUrl(url)) return false
  return !/\/webapps\/login|\/authValidate|\/cas\//i.test(url.pathname)
}

async function launchBrowser(
  channel: 'msedge' | 'chrome',
): Promise<Browser> {
  return chromium.launch({
    channel,
    headless: false,
    args: ['--no-first-run', '--no-default-browser-check'],
  })
}

/**
 * Open a real browser window and let the user complete USTC SSO + captcha.
 * This function never reads or types the password; it only captures the
 * resulting Blackboard session cookies after the user reaches the portal.
 */
export async function loginBlackboardWithBrowser(
  options: BlackboardLoginOptions = {},
): Promise<BlackboardLoginResult> {
  const channels = options.channel ? [options.channel] : (['msedge', 'chrome'] as const)
  let browser: Browser | undefined
  let context: BrowserContext | undefined
  let launchError: unknown
  for (const channel of channels) {
    try {
      browser = await launchBrowser(channel)
      break
    } catch (error) {
      launchError = error
    }
  }
  if (!browser) {
    throw new Error(
      `无法启动 Edge/Chrome 登录窗口：${launchError instanceof Error ? launchError.message : String(launchError)}`,
    )
  }

  try {
    context = await browser.newContext({
      locale: 'zh-CN',
      viewport: { width: 1280, height: 900 },
    })
    const page = await context.newPage()
    await page.goto(USTC_BLACKBOARD_LOGIN_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })

    // SSO may navigate the same tab or open a popup, so inspect every page in
    // the browser context until one reaches a Blackboard portal URL.
    const deadline = Date.now() + (options.timeoutMs ?? 4 * 60_000)
    let loggedPage = page
    while (Date.now() < deadline) {
      if (!browser.isConnected()) {
        throw new Error('登录窗口已关闭，未完成 Blackboard 登录')
      }
      const reached = context.pages().find((candidate) => {
        try {
          return isLoggedInUrl(new URL(candidate.url()))
        } catch {
          return false
        }
      })
      if (reached) {
        loggedPage = reached
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    let finalUrl: URL
    try {
      finalUrl = new URL(loggedPage.url())
    } catch {
      throw new Error('未能读取登录后的 Blackboard 页面')
    }
    if (!isLoggedInUrl(finalUrl)) {
      throw new Error('登录超时：未检测到 Blackboard 门户')
    }
    await loggedPage.waitForLoadState('domcontentloaded').catch(() => undefined)

    const cookies = await context.cookies()
    const blackboardCookies = cookies.filter((cookie) => {
      const domain = cookie.domain.replace(/^\./, '')
      return domain === 'bb.ustc.edu.cn' || domain.endsWith('.bb.ustc.edu.cn')
    })
    const cookieHeader = blackboardCookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ')
    if (!cookieHeader) {
      throw new Error('登录成功但未读取到 Blackboard 会话 Cookie')
    }
    const title = await loggedPage.title().catch(() => undefined)
    return {
      cookieHeader,
      cookieCount: blackboardCookies.length,
      finalOrigin: finalUrl.origin,
      finalPath: finalUrl.pathname,
      ...(title ? { title } : {}),
    }
  } finally {
    await context?.close().catch(() => undefined)
    await browser.close().catch(() => undefined)
  }
}
