import type { Context } from '@deepseek-ai/cordis'

export const name = 'academic-planner'
export const inject = ['academicApp']

/**
 * Registers the planner capability as its own fiber-owned effect. Unloading
 * this plugin removes the capability while accepted plans stay queryable.
 */
export function apply(ctx: Context, config: { log?: boolean } = {}): void {
  ctx.effect(async () => {
    const app = await ctx.academicApp.appReady
    const registration = app.registerPlannerCapability()
    if (config.log !== false) console.log('[academic-planner] capability registered')
    return () => {
      registration.dispose()
      if (config.log !== false) console.log('[academic-planner] capability released')
    }
  }, 'academic-planner')
}

export default { name, inject, apply }

