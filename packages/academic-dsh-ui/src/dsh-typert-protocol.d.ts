declare module '@deepseek-ai/dsh-typert-protocol' {
  export class TypertRemoteService {
    readonly name: string
    readonly typertRemote: unknown
    constructor(ctx: unknown, serviceKey: string, options?: { namespace?: string })
  }

  export function Remote(...args: unknown[]): unknown
}
