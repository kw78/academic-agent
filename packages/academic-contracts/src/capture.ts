export type CaptureEndpointKind = 'list' | 'detail' | 'document' | 'other'

export interface CaptureField {
  key: string
  /** Path relative to one row, e.g. details.due. */
  path?: string
  type: string
  /** Short, truncated example so the model can recognise semantics. */
  example?: string
}

/** One array node found in a JSON response, with its exact path. */
export interface CaptureCollection {
  /** Dot path from the response root, e.g. data.payload.result.records. */
  path: string
  itemCount: number
  score: number
  fields: CaptureField[]
  /** An observed list endpoint that returned no rows. */
  empty?: boolean
  /** Reference/dictionary data (schools, regions), not the user's own list. */
  reference?: boolean
}

/**
 * One request observed in the user's own logged-in browser. Raw bodies stay in
 * the host sample store; this summary is what the agent is allowed to see.
 */
export interface CaptureEndpoint {
  sampleId: string
  host: string
  path: string
  /** Full URL with token-like query values masked. */
  url: string
  method: 'GET' | 'POST'
  status: number
  contentType?: string
  bytes: number
  kind: CaptureEndpointKind
  score: number
  request: {
    queryKeys: string[]
    bodyKeys: string[]
    /** Masked request body so the agent can build the same read-only request. */
    bodyPreview?: string
    /** Header names only, e.g. x-requested-with; values are never exported. */
    headerHints: string[]
  }
  /** POST bodies the current Manifest runtime cannot reproduce are reported, not hidden. */
  transport?: 'json' | 'form' | 'other'
  response: {
    root: 'array' | 'object' | 'other'
    itemCount?: number
    /** Best collection path; null when the body is not JSON. */
    collectionPath?: string
    fields: CaptureField[]
  }
  /** Every array node, best first. The agent picks the one with the right meaning. */
  collections?: CaptureCollection[]
  pagination?: {
    param: string
    values: string[]
  }
}

/** Host-decided next step; the agent must not be the one inferring it. */
export interface CaptureNextStep {
  action: 'validate' | 'recapture' | 'unsupported-transport' | 'needs-confirmation'
  label: string
  reason?: string
}

export interface SourceCaptureSummary {
  captureId: string
  sourceId: string
  startedAt: string
  finishedAt: string
  hosts: string[]
  visited: number
  endpoints: CaptureEndpoint[]
  nextStep: CaptureNextStep
  suggested: {
    cookieDomains: string[]
    pathPrefixes: string[]
  }
  warnings: string[]
}
