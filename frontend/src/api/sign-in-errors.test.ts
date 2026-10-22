import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { server } from '../test/server'

import { ApiError, apiRequest } from './client'

const sessionSchema = z.object({
  type: z.literal('applicant-sessions'),
  attributes: z.object({ href: z.string() }),
})

describe('sign-in error classification', () => {
  it('treats a 401 from the API as invalid credentials', async () => {
    server.use(
      http.post('/api/v1/applicant-sessions', () =>
        HttpResponse.json(
          {
            errors: [
              {
                status: '401',
                code: 'invalid-credentials',
                title: 'Authentication failed',
                detail: 'Invalid email or password',
              },
            ],
          },
          { status: 401 },
        ),
      ),
    )

    const failure = await apiRequest(
      '/api/v1/applicant-sessions',
      sessionSchema,
      {
        method: 'POST',
        body: {},
      },
    ).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).kind).toBe('authentication')
    expect((failure as ApiError).status).toBe(401)
  })

  it('reports a malformed 201 body as an unexpected failure, never as bad credentials', async () => {
    server.use(
      http.post('/api/v1/applicant-sessions', () =>
        // The backend returns the journey under `href`; a different shape must not be
        // mistaken for an authentication failure.
        HttpResponse.json(
          {
            data: {
              type: 'applicant-sessions',
              attributes: { journeyUrl: '/x' },
            },
          },
          { status: 201 },
        ),
      ),
    )

    const failure = await apiRequest(
      '/api/v1/applicant-sessions',
      sessionSchema,
      {
        method: 'POST',
        body: {},
      },
    ).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).kind).toBe('unexpected')
    expect((failure as ApiError).status).toBe(201)
  })
})
