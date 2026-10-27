import type { AcademicApp } from '@academic/cli'

declare module '@deepseek-ai/cordis' {
  interface Context {
    academicApp: {
      appReady: Promise<AcademicApp>
    }
  }
}

export {}
