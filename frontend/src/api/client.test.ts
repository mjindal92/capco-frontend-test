import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../test/server'

import { apiRequest } from './client'

describe('apiRequest', () => {
  it('returns undefined for a 204 response with no body', async () => {
    server.use(
      http.get('/api/v1/probe', () => new HttpResponse(null, { status: 204 })),
    )

    const result = await apiRequest(
      '/api/v1/probe',
      (await import('zod')).z.unknown(),
    )

    expect(result).toBeUndefined()
  })
})
