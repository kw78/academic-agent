import type { AcademicApp } from '@academic/application'

declare module '@deepseek-ai/cordis' {
  interface Context {
    academicApp: {
      appReady: Promise<AcademicApp>
    }
  }
}

export {}
