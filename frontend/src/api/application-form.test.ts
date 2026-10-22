import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../test/server'

import { findCurrentApplication } from './application-form'

describe('findCurrentApplication', () => {
  it('returns undefined when the applicant has no draft', async () => {
    server.use(
      http.get(
        '/api/v1/applicant-applications/current',
        () => new HttpResponse(null, { status: 204 }),
      ),
    )

    await expect(findCurrentApplication()).resolves.toBeUndefined()
  })
})
