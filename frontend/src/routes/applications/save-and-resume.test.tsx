import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createRoutesStub } from 'react-router'
import { describe, expect, it } from 'vitest'

import { server } from '../../test/server'

import ApplicationStepPage from './$applicationId/$step'

const applicationId = '11111111-1111-5111-8111-111111111111'
const formUrl = `/api/v1/applicant-applications/${applicationId}/form`

interface FormState {
  answers: Record<string, string | boolean | null>
  version: number
}

function formResponse(state: FormState) {
  return HttpResponse.json({
    data: {
      type: 'applicant-application-forms',
      id: applicationId,
      attributes: {
        status: 'draft',
        currentStep: 'personal-details',
        steps: [],
        answers: state.answers,
        documentEvidence: { present: false },
        version: state.version,
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
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const tree = (
    <QueryClientProvider client={client}>
      <Stub initialEntries={[`/applications/${applicationId}/${step}`]} />
    </QueryClientProvider>
  )
  const view = render(tree)
  return {
    user: userEvent.setup({ delay: null }),
    // A later sign-in starts with an empty cache, exactly like a fresh page load.
    reenterAsNewSession: () => {
      client.clear()
      view.rerender(tree)
    },
  }
}

describe('saving and resuming a draft', () => {
  it('saves the step, then shows the saved answers after a later sign-in', async () => {
    // The server holds the only copy of the answers.
    const serverState: FormState = { answers: {}, version: 1 }
    let saveBody: unknown
    server.use(
      http.get(formUrl, () => formResponse(serverState)),
      http.patch(formUrl, async ({ request }) => {
        saveBody = await request.json()
        const body = saveBody as {
          data: { attributes: { answers: Record<string, string | boolean> } }
        }
        serverState.answers = { ...body.data.attributes.answers }
        serverState.version += 1
        return formResponse(serverState)
      }),
    )

    const { user, reenterAsNewSession } = renderStep('personal-details')

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

    // A saved state is only shown after the API confirms it.
    expect(await screen.findByText('Your answers were saved.')).toBeVisible()
    expect(saveBody).toMatchObject({
      data: {
        type: 'applicant-application-forms',
        attributes: { step: 'personal-details', version: 1 },
      },
    })

    // Simulate signing out and in again: nothing is kept in memory.
    reenterAsNewSession()

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

  it('saves identity and address independently of personal details', async () => {
    let saveBody: unknown
    server.use(
      http.get(formUrl, () =>
        formResponse({
          answers: { name: 'Ada Lovelace', street: 'Old Street' },
          version: 4,
        }),
      ),
      http.patch(formUrl, async ({ request }) => {
        saveBody = await request.json()
        return formResponse({ answers: {}, version: 5 })
      }),
    )

    const { user } = renderStep('identity-and-address')
    const street = await screen.findByLabelText('Street address')
    expect(street).toHaveValue('Old Street')

    await user.type(screen.getByLabelText('Document type'), 'Passport')
    await user.type(screen.getByLabelText('Document number'), 'X1234567')
    await user.type(screen.getByLabelText('Document country'), 'UK')
    await user.type(screen.getByLabelText('Expiry date'), '2030-01-01')
    await user.type(screen.getByLabelText('City'), 'London')
    await user.type(screen.getByLabelText('Postal code'), 'N1 1AA')
    await user.type(screen.getByLabelText('Residential country'), 'UK')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(saveBody).toBeDefined())
    const attributes = (
      saveBody as { data: { attributes: Record<string, unknown> } }
    ).data.attributes
    expect(attributes.step).toBe('identity-and-address')
    expect(attributes.version).toBe(4)
    // Personal-details answers are never sent with the identity step.
    expect(attributes.answers).not.toHaveProperty('name')
  })
})
