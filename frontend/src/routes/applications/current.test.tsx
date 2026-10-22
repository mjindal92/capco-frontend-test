import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createRoutesStub } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  findCurrentApplication,
  getApplicationForm,
} from '../../api/application-form'
import { server } from '../../test/server'

import CurrentApplicationJourneyPage from './current'

const applicationId = '11111111-1111-5111-8111-111111111111'
const formHref = `/applications/${applicationId}/personal-details`
const currentUrl = '/api/v1/applicant-applications/current'
const startUrl = '/api/v1/applicant-applications'
const formUrl = `/api/v1/applicant-applications/${applicationId}/form`

function journeyDocument() {
  return {
    data: {
      type: 'applicant-applications',
      id: applicationId,
      attributes: {
        status: 'draft',
        currentStep: 'personal-details',
        href: formHref,
        progress: [
          { step: 'personal-details', state: 'current' },
          { step: 'identity-and-address', state: 'not-started' },
        ],
      },
    },
  }
}

function renderPage() {
  const Stub = createRoutesStub([
    {
      path: '/applications/current',
      Component: CurrentApplicationJourneyPage,
      loader: () => ({}),
    },
    { path: '/applications/:applicationId/:step', Component: () => null },
    { path: '/sign-in', Component: () => null },
  ])
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <Stub initialEntries={['/applications/current']} />
    </QueryClientProvider>,
  )
  return userEvent.setup()
}

describe('Current application page', () => {
  beforeEach(() => {
    server.use(
      http.get(currentUrl, () => new HttpResponse(null, { status: 204 })),
    )
  })

  it('starts a draft and opens its first step when the Applicant has none', async () => {
    let started = 0
    server.use(
      http.post(startUrl, () => {
        started += 1
        return HttpResponse.json(journeyDocument(), { status: 201 })
      }),
    )

    const user = renderPage()
    await user.click(
      await screen.findByRole('button', { name: 'Start application' }),
    )

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Start application' }),
      ).toBeNull(),
    )
    expect(started).toBe(1)
  })

  it('resumes a saved draft at the step the API reports', async () => {
    server.use(http.get(currentUrl, () => HttpResponse.json(journeyDocument())))

    const user = renderPage()
    await user.click(
      await screen.findByRole('button', { name: 'Resume application' }),
    )

    expect(
      screen.queryByRole('button', { name: 'Resume application' }),
    ).toBeNull()
  })

  it('reports a failed start without claiming the application opened', async () => {
    server.use(
      http.post(startUrl, () => new HttpResponse(null, { status: 500 })),
    )

    const user = renderPage()
    await user.click(
      await screen.findByRole('button', { name: 'Start application' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your application could not be opened',
    )
    expect(
      screen.getByRole('button', { name: 'Start application' }),
    ).toBeVisible()
  })

  it('offers sign-in when the session has expired', async () => {
    server.use(
      http.get(currentUrl, () => new HttpResponse(null, { status: 401 })),
    )

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Sign in to continue' }),
    ).toBeVisible()
  })

  it('never navigates to a non-form href supplied by the API', async () => {
    server.use(
      http.get(currentUrl, () =>
        HttpResponse.json({
          data: {
            ...journeyDocument().data,
            attributes: {
              ...journeyDocument().data.attributes,
              href: '/api/v1/applicant-applications/prototype/form',
            },
          },
        }),
      ),
    )

    renderPage()

    expect(
      await screen.findByRole('heading', {
        name: 'Your application cannot be edited',
      }),
    ).toBeVisible()
  })
})

describe('saved answers survive a new session', () => {
  it('reads the draft and its answers back from the API', async () => {
    const saved = {
      name: 'Ada Lovelace',
      dateOfBirth: '1815-12-10',
      country: 'United Kingdom',
      nationality: 'British',
      email: 'ada@example.com',
      phone: '0123456789',
      consentConfirmed: true,
    }
    // Only the API holds the answers; nothing is read from browser storage.
    server.use(
      http.get(currentUrl, () => HttpResponse.json(journeyDocument())),
      http.get(formUrl, () =>
        HttpResponse.json({
          data: {
            type: 'applicant-application-forms',
            id: applicationId,
            attributes: {
              status: 'draft',
              currentStep: 'personal-details',
              steps: [],
              answers: saved,
              documentEvidence: { present: false },
              version: 7,
            },
          },
        }),
      ),
    )

    const draft = await findCurrentApplication()
    expect(draft?.attributes.href).toBe(formHref)

    const form = await getApplicationForm(draft!.id)
    const { answers } = form.attributes
    expect(answers.name).toBe('Ada Lovelace')
    expect(answers.dateOfBirth).toBe('1815-12-10')
    expect(answers.country).toBe('United Kingdom')
    expect(answers.nationality).toBe('British')
    expect(answers.email).toBe('ada@example.com')
    expect(answers.phone).toBe('0123456789')
    expect(answers.consentConfirmed).toBe(true)
    // Unanswered fields are explicitly empty rather than undefined.
    expect(answers.city).toBeNull()
    expect(form.attributes.version).toBe(7)
  })
})
