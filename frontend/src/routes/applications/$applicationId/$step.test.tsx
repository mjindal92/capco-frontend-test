import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createRoutesStub } from 'react-router'
import { describe, expect, it } from 'vitest'

import { server } from '../../../test/server'

import ApplicationStepPage from './$step'

const applicationId = '11111111-1111-5111-8111-111111111111'
const formUrl = `/api/v1/applicant-applications/${applicationId}/form`

function formDocument(overrides: {
  answers?: Record<string, unknown>
  version?: number
}) {
  return {
    data: {
      type: 'applicant-application-forms',
      id: 'form-1',
      attributes: {
        status: 'draft',
        currentStep: 'personal-details',
        steps: [],
        answers: { name: 'Ada Lovelace', ...overrides.answers },
        documentEvidence: { present: false },
        version: overrides.version ?? 3,
      },
    },
  }
}

function renderStep(
  step: 'personal-details' | 'identity-and-address',
  id: string = applicationId,
) {
  const Stub = createRoutesStub([
    {
      path: '/applications/:applicationId/:step',
      Component: ApplicationStepPage,
      loader: () => null,
    },
  ])
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Stub initialEntries={[`/applications/${id}/${step}`]} />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('Application step form', () => {
  it('does not request the API for a malformed application id', async () => {
    let requested = false
    server.use(
      http.get(`/api/v1/applicant-applications/*`, () => {
        requested = true
        return HttpResponse.json({}, { status: 500 })
      }),
    )

    renderStep('personal-details', 'prototype')

    expect(
      await screen.findByRole('heading', {
        name: 'This application could not be found',
      }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Back to your application' }),
    ).toBeVisible()
    expect(requested).toBe(false)
  })

  it('populates every previously saved answer', async () => {
    server.use(
      http.get(formUrl, () =>
        HttpResponse.json(
          formDocument({
            answers: {
              name: 'Ada Lovelace',
              dateOfBirth: '1815-12-10',
              country: 'United Kingdom',
              nationality: 'British',
              email: 'ada@example.com',
              phone: '0123456789',
              consentConfirmed: true,
            },
          }),
        ),
      ),
    )

    renderStep('personal-details')

    expect(await screen.findByLabelText('Full name')).toHaveValue(
      'Ada Lovelace',
    )
    expect(screen.getByLabelText('Date of birth')).toHaveValue('1815-12-10')
    expect(screen.getByLabelText('Country of residence')).toHaveValue(
      'United Kingdom',
    )
    expect(screen.getByLabelText('Nationality')).toHaveValue('British')
    expect(screen.getByLabelText('Email address')).toHaveValue(
      'ada@example.com',
    )
    expect(screen.getByLabelText('Phone number')).toHaveValue('0123456789')
    expect(
      screen.getByLabelText(
        'I confirm these details are accurate and belong to me.',
      ),
    ).toBeChecked()
  })

  it('sends only the selected step answers with the current version', async () => {
    let body: unknown
    let csrfHeader: string | null = null
    server.use(
      http.get(formUrl, () => HttpResponse.json(formDocument({}))),
      http.patch(formUrl, async ({ request }) => {
        body = await request.json()
        csrfHeader = request.headers.get('X-XSRF-TOKEN')
        return HttpResponse.json(formDocument({ version: 4 }))
      }),
    )

    // The CSRF cookie is read from document.cookie, exactly as the browser exposes it.
    document.cookie = 'XSRF-TOKEN=token-abc'

    const user = renderStep('personal-details')
    const name = await screen.findByLabelText('Full name')
    await user.clear(name)
    await user.type(name, 'Grace Hopper')
    await user.type(screen.getByLabelText('Date of birth'), '1906-12-09')
    await user.type(screen.getByLabelText('Country of residence'), 'USA')
    await user.type(screen.getByLabelText('Nationality'), 'American')
    await user.type(screen.getByLabelText('Email address'), 'grace@example.com')
    await user.type(screen.getByLabelText('Phone number'), '0123')
    await user.click(
      screen.getByLabelText(
        'I confirm these details are accurate and belong to me.',
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))

    expect(await screen.findByText('Your answers were saved.')).toBeVisible()
    expect(csrfHeader).toBe('token-abc')
    expect(body).toEqual({
      data: {
        type: 'applicant-application-forms',
        attributes: {
          step: 'personal-details',
          version: 3,
          answers: {
            name: 'Grace Hopper',
            dateOfBirth: '1906-12-09',
            country: 'USA',
            nationality: 'American',
            email: 'grace@example.com',
            phone: '0123',
            consentConfirmed: true,
          },
        },
      },
    })
  })

  it('keeps entered values and reports a failed save without claiming success', async () => {
    server.use(
      http.get(formUrl, () => HttpResponse.json(formDocument({}))),
      http.patch(formUrl, () =>
        HttpResponse.json(
          {
            errors: [
              {
                status: '409',
                code: 'form-version-conflict',
                title: 'Conflict',
                detail: 'The form changed.',
              },
            ],
          },
          { status: 409 },
        ),
      ),
    )

    const user = renderStep('personal-details')
    const name = await screen.findByLabelText('Full name')
    await user.clear(name)
    await user.type(name, 'Changed Name')
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Complete the required fields before continuing',
    )
    expect(screen.queryByText('Your answers were saved.')).toBeNull()
    expect(name).toHaveValue('Changed Name')
  })

  it('reports a server save conflict and keeps entered values', async () => {
    server.use(
      http.get(formUrl, () =>
        HttpResponse.json(
          formDocument({
            answers: {
              name: 'Ada Lovelace',
              dateOfBirth: '1815-12-10',
              country: 'United Kingdom',
              nationality: 'British',
              email: 'ada@example.com',
              phone: '0123456789',
              consentConfirmed: true,
            },
          }),
        ),
      ),
      http.patch(formUrl, () =>
        HttpResponse.json(
          {
            errors: [
              {
                status: '409',
                code: 'form-version-conflict',
                title: 'Conflict',
                detail: 'The form changed.',
              },
            ],
          },
          { status: 409 },
        ),
      ),
    )

    const user = renderStep('personal-details')
    const name = await screen.findByLabelText('Full name')
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This application was updated elsewhere',
    )
    expect(screen.queryByText('Your answers were saved.')).toBeNull()
    expect(name).toHaveValue('Ada Lovelace')
  })

  it('shows a sign-in link when the session has expired', async () => {
    server.use(
      http.get(formUrl, () =>
        HttpResponse.json(
          {
            errors: [
              {
                status: '401',
                code: 'authentication-required',
                title: 'Authentication required',
                detail: 'Sign in to continue.',
              },
            ],
          },
          { status: 401 },
        ),
      ),
    )

    renderStep('personal-details')

    expect(
      await screen.findByRole('heading', { name: 'Your session has expired' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      `/sign-in?returnTo=${encodeURIComponent(
        `/applications/${applicationId}/personal-details`,
      )}`,
    )
  })

  it('offers sign-in when the session expires while saving', async () => {
    server.use(
      http.get(formUrl, () =>
        HttpResponse.json(
          formDocument({
            answers: {
              name: 'Ada Lovelace',
              dateOfBirth: '1815-12-10',
              country: 'United Kingdom',
              nationality: 'British',
              email: 'ada@example.com',
              phone: '0123456789',
              consentConfirmed: true,
            },
          }),
        ),
      ),
      http.patch(formUrl, () => new HttpResponse(null, { status: 401 })),
    )

    const user = renderStep('personal-details')
    await user.click(
      await screen.findByRole('button', { name: 'Save and continue' }),
    )

    expect(
      await screen.findByRole('heading', { name: 'Your session has expired' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      `/sign-in?returnTo=${encodeURIComponent(
        `/applications/${applicationId}/personal-details`,
      )}`,
    )
  })
})
