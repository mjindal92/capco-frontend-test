import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createRoutesStub } from 'react-router'
import { describe, expect, it } from 'vitest'

import { server } from '../../test/server'

import ApplicationStepPage from './$applicationId/$step'

const applicationId = '11111111-1111-5111-8111-111111111111'
const formUrl = `/api/v1/applicant-applications/${applicationId}/form`

const completePersonalDetails = {
  name: 'Ada Lovelace',
  dateOfBirth: '1815-12-10',
  country: 'United Kingdom',
  nationality: 'British',
  email: 'ada@example.com',
  phone: '0123456789',
  consentConfirmed: true,
}

function formResponse(
  answers: Record<string, unknown>,
  currentStep: 'personal-details' | 'identity-and-address',
) {
  return HttpResponse.json({
    data: {
      type: 'applicant-application-forms',
      id: applicationId,
      attributes: {
        status: 'draft',
        currentStep,
        steps: [],
        answers,
        documentEvidence: { present: false },
        version: 2,
      },
    },
  })
}

function renderStep(step: 'personal-details' | 'identity-and-address') {
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
      <Stub initialEntries={[`/applications/${applicationId}/${step}`]} />
    </QueryClientProvider>,
  )
  return { user: userEvent.setup({ delay: null }) }
}

describe('advancing to the next step', () => {
  it('renders the consent checkbox inline to the left of its label', async () => {
    server.use(http.get(formUrl, () => formResponse({}, 'personal-details')))

    renderStep('personal-details')
    const checkbox = await screen.findByLabelText(
      'I confirm these details are accurate and belong to me.',
    )
    const [first, second] = Array.from(checkbox.parentElement?.children ?? [])

    expect(first).toBe(checkbox)
    expect(second?.tagName).toBe('LABEL')
    expect(second?.textContent).toBe(
      'I confirm these details are accurate and belong to me.',
    )
  })

  it('shows the identity step after saving complete personal details', async () => {
    let saved = false
    server.use(
      http.get(formUrl, () =>
        formResponse(
          saved ? completePersonalDetails : {},
          saved ? 'identity-and-address' : 'personal-details',
        ),
      ),
      http.patch(formUrl, () => {
        saved = true
        return formResponse(completePersonalDetails, 'identity-and-address')
      }),
    )

    const { user } = renderStep('personal-details')

    await user.type(await screen.findByLabelText('Full name'), 'Ada Lovelace')
    await user.type(screen.getByLabelText('Date of birth'), '1815-12-10')
    await user.type(
      screen.getByLabelText('Country of residence'),
      'United Kingdom',
    )
    await user.type(screen.getByLabelText('Nationality'), 'British')
    await user.type(screen.getByLabelText('Email address'), 'ada@example.com')
    await user.type(screen.getByLabelText('Phone number'), '0123456789')
    await user.click(
      screen.getByLabelText(
        'I confirm these details are accurate and belong to me.',
      ),
    )
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))

    // The next step replaces the current one; the identity form is now rendered.
    expect(
      await screen.findByRole('heading', { name: 'Identity and address' }),
    ).toBeVisible()
  })

  it('stays on the step and explains when the save did not persist', async () => {
    server.use(
      http.get(formUrl, () =>
        formResponse(completePersonalDetails, 'personal-details'),
      ),
      http.patch(formUrl, () => new HttpResponse(null, { status: 422 })),
    )

    const { user } = renderStep('personal-details')
    await user.click(
      await screen.findByRole('button', { name: 'Save and continue' }),
    )

    expect(await screen.findByRole('alert')).toBeVisible()
    // A failed save must not advance the Applicant.
    expect(
      screen.getByRole('heading', { name: 'Personal details' }),
    ).toBeVisible()
  })
})
