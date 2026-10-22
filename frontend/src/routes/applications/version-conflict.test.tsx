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

const personalDetails = {
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
  version: number,
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
        version,
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
  render(
    <QueryClientProvider client={client}>
      <Stub initialEntries={[`/applications/${applicationId}/${step}`]} />
    </QueryClientProvider>,
  )
  return { user: userEvent.setup({ delay: null }), client }
}

describe('form version across steps', () => {
  it(
    'sends the version bumped by the previous step, not a stale one',
    { timeout: 20_000 },
    async () => {
      // The server is authoritative: version 1 after step 1 saves, 2 after step 2 saves.
      let serverVersion = 0
      let serverStep: 'personal-details' | 'identity-and-address' =
        'personal-details'
      const savedVersions: number[] = []

      server.use(
        http.get(formUrl, () =>
          formResponse(
            serverStep === 'personal-details'
              ? {}
              : { ...personalDetails, street: 'Old Street' },
            serverStep,
            serverVersion,
          ),
        ),
        http.patch(formUrl, async ({ request }) => {
          const body = (await request.json()) as {
            data: { attributes: { version: number; step: string } }
          }
          savedVersions.push(body.data.attributes.version)
          if (body.data.attributes.version !== serverVersion) {
            return HttpResponse.json(
              {
                errors: [
                  {
                    status: '409',
                    code: 'form-version-conflict',
                    title: 'Form changed',
                    detail: 'Reload the form and try again.',
                  },
                ],
              },
              { status: 409 },
            )
          }
          serverVersion += 1
          serverStep =
            body.data.attributes.step === 'personal-details'
              ? 'identity-and-address'
              : 'identity-and-address'
          return formResponse(
            { ...personalDetails, street: 'Old Street' },
            serverStep,
            serverVersion,
          )
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
      await user.click(
        screen.getByRole('button', { name: 'Save and continue' }),
      )

      // Step 2 is rendered from the state the API returned, with version 1.
      expect(
        await screen.findByRole('heading', { name: 'Identity and address' }),
      ).toBeVisible()
      expect(screen.queryByRole('alert')).toBeNull()

      await user.type(screen.getByLabelText('Document type'), 'Passport')
      await user.type(screen.getByLabelText('Document number'), 'X1234567')
      await user.type(screen.getByLabelText('Document country'), 'UK')
      await user.type(screen.getByLabelText('Expiry date'), '2030-01-01')
      await user.type(screen.getByLabelText('City'), 'London')
      await user.type(screen.getByLabelText('Postal code'), 'N1 1AA')
      await user.type(screen.getByLabelText('Residential country'), 'UK')
      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(await screen.findByText('Your answers were saved.')).toBeVisible()
      // No 409: step 2 used the version the previous save produced.
      expect(savedVersions).toEqual([0, 1])
    },
  )

  it('offers a reload action that clears a version conflict', async () => {
    let serverVersion = 5
    let serverAnswers: Record<string, unknown> = { ...personalDetails }
    server.use(
      http.get(formUrl, () =>
        formResponse(serverAnswers, 'identity-and-address', serverVersion),
      ),
      http.patch(formUrl, async ({ request }) => {
        const body = (await request.json()) as {
          data: { attributes: { version: number } }
        }
        if (body.data.attributes.version !== serverVersion) {
          return HttpResponse.json(
            {
              errors: [
                {
                  status: '409',
                  code: 'form-version-conflict',
                  title: 'Form changed',
                  detail: 'Reload the form and try again.',
                },
              ],
            },
            { status: 409 },
          )
        }
        serverVersion += 1
        return formResponse(
          serverAnswers,
          'identity-and-address',
          serverVersion,
        )
      }),
    )

    const { user } = renderStep('identity-and-address')
    await screen.findByLabelText('Street address')

    // Another session saves first, so this form's version becomes stale.
    serverVersion = 6
    serverAnswers = {
      ...personalDetails,
      documentType: 'Passport',
      documentNumber: 'X1234567',
      documentCountry: 'UK',
      expiry: '2030-01-01',
      street: 'Saved elsewhere',
      city: 'London',
      postal: 'N1 1AA',
      residentialCountry: 'UK',
    }

    await user.type(screen.getByLabelText('Document type'), 'Passport')
    await user.type(screen.getByLabelText('Document number'), 'X1234567')
    await user.type(screen.getByLabelText('Document country'), 'UK')
    await user.type(screen.getByLabelText('Expiry date'), '2030-01-01')
    await user.type(screen.getByLabelText('Street address'), 'New Street')
    await user.type(screen.getByLabelText('City'), 'London')
    await user.type(screen.getByLabelText('Postal code'), 'N1 1AA')
    await user.type(screen.getByLabelText('Residential country'), 'UK')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'updated elsewhere',
    )

    await user.click(screen.getByRole('button', { name: 'Reload latest' }))

    // Reloading adopts the server's answers and version, then a retry succeeds.
    await waitFor(() =>
      expect(screen.getByLabelText('Street address')).toHaveValue(
        'Saved elsewhere',
      ),
    )
    expect(screen.queryByRole('alert')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Your answers were saved.')).toBeVisible()
  })
})
