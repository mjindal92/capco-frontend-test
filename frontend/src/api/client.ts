import { z } from 'zod'

const JSON_API_MEDIA_TYPE = 'application/vnd.api+json'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const errorObjectSchema = z.object({
  status: z.string(),
  code: z.string(),
  title: z.string(),
  detail: z.string(),
  source: z.object({ pointer: z.string() }).optional(),
})

const errorDocumentSchema = z.object({
  errors: z.array(errorObjectSchema).min(1),
})

export interface ApiFieldError {
  pointer: string
  message: string
}

export type ApiFailureKind =
  | 'validation'
  | 'authentication'
  | 'conflict'
  | 'rate-limited'
  | 'network'
  | 'unexpected'

/**
 * Normalised API failure. `kind` drives the message the user sees; `status`
 * and `code` stay available for callers that branch on a specific contract error.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly kind: ApiFailureKind
  readonly fieldErrors: readonly ApiFieldError[]

  constructor(
    message: string,
    options: {
      status: number
      code: string
      kind: ApiFailureKind
      fieldErrors?: readonly ApiFieldError[]
    },
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = options.status
    this.code = options.code
    this.kind = options.kind
    this.fieldErrors = options.fieldErrors ?? []
  }
}

const networkMessage =
  'We could not reach the service. Check your connection and try again.'
const unexpectedMessage = 'Something went wrong. Please try again.'

function kindForStatus(status: number): ApiFailureKind {
  if (status === 400 || status === 422) return 'validation'
  if (status === 401) return 'authentication'
  if (status === 409) return 'conflict'
  if (status === 429) return 'rate-limited'
  return 'unexpected'
}

async function toApiError(response: Response): Promise<ApiError> {
  const kind = kindForStatus(response.status)
  try {
    const document = errorDocumentSchema.parse(await response.json())
    const [first] = document.errors
    if (!first) throw new Error('Empty errors array')
    return new ApiError(first.detail, {
      status: response.status,
      code: first.code,
      kind,
      fieldErrors: document.errors.flatMap((error) =>
        error.source
          ? [{ pointer: error.source.pointer, message: error.detail }]
          : [],
      ),
    })
  } catch {
    return new ApiError(
      response.status === 429
        ? 'Too many attempts. Please wait a moment and try again.'
        : unexpectedMessage,
      { status: response.status, code: 'unknown', kind },
    )
  }
}

/** The API requires this token on authenticated writes; it mirrors the XSRF-TOKEN cookie. */
export function readCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined
  return document.cookie
    .split('; ')
    .find((entry) => entry.startsWith('XSRF-TOKEN='))
    ?.slice('XSRF-TOKEN='.length)
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
}

/**
 * Sends a JSON:API request and returns the parsed `data` member, or `undefined`
 * for responses without a body. Failures always surface as `ApiError`.
 */
export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  { method = 'GET', body }: ApiRequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: JSON_API_MEDIA_TYPE }
  if (body !== undefined) headers['Content-Type'] = JSON_API_MEDIA_TYPE
  if (!SAFE_METHODS.has(method)) {
    const csrfToken = readCsrfToken()
    if (csrfToken) headers['X-XSRF-TOKEN'] = csrfToken
  }

  let response: Response
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(networkMessage, {
      status: 0,
      code: 'network-error',
      kind: 'network',
    })
  }

  if (!response.ok) throw await toApiError(response)
  if (response.status === 204) return undefined as T

  // Not every successful response carries a document; callers that need one use a real schema.
  if (response.status === 201 && !response.headers.has('content-type')) {
    return undefined as T
  }

  try {
    const document = z.object({ data: schema }).parse(await response.json())
    return document.data
  } catch {
    throw new ApiError(unexpectedMessage, {
      status: response.status,
      code: 'invalid-response',
      kind: 'unexpected',
    })
  }
}

/** Strips the JSON:API `/data/attributes/` prefix so callers can key by field name. */
export function fieldNameFromPointer(pointer: string): string {
  return pointer.slice(pointer.lastIndexOf('/') + 1)
}
