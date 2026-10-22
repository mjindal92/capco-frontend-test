import { render, screen } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { server } from '../test/server'

import { CreateAccountForm } from './-create-account-form'

const apiUrl = '/api/v1/applicant-accounts'

function renderForm(onNavigate?: (href: string) => void) {
  render(<CreateAccountForm onNavigate={onNavigate} />)
  return {
    user: userEvent.setup(),
    email: screen.getByLabelText('Email address'),
    password: screen.getByLabelText('Password'),
    confirmPassword: screen.getByLabelText('Confirm password'),
    submit: screen.getByRole('button', { name: 'Create account' }),
  }
}

async function fillValidAccount(
  user: UserEvent,
  fields: {
    email: HTMLElement
    password: HTMLElement
    confirmPassword: HTMLElement
  },
) {
  await user.type(fields.email, 'applicant@example.com')
  await user.type(fields.password, 'Secret1!')
  await user.type(fields.confirmPassword, 'Secret1!')
}

describe('CreateAccountForm', () => {
  it('shows contract validation errors without calling the API', async () => {
    const request = vi.fn()
    server.use(http.post(apiUrl, request))

    const { user, email, password, confirmPassword, submit } = renderForm()
    await user.type(email, 'applicant@example.com')
    await user.type(password, 'secret')
    await user.type(confirmPassword, 'different')
    await user.click(submit)

    expect(
      screen.getByText('Include at least one uppercase letter.'),
    ).toBeVisible()
    expect(screen.getByText('Passwords do not match.')).toBeVisible()
    expect(request).not.toHaveBeenCalled()
  })

  it('submits a JSON:API document and confirms creation with a sign-in link', async () => {
    let body: unknown
    let contentType: string | null = null
    server.use(
      http.post(apiUrl, async ({ request }) => {
        body = await request.json()
        contentType = request.headers.get('Content-Type')
        return new HttpResponse(null, { status: 201 })
      }),
    )

    const { user, email, password, confirmPassword, submit } = renderForm()
    await fillValidAccount(user, { email, password, confirmPassword })
    await user.click(submit)

    expect(await screen.findByText('Account created')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Go to sign in' })).toBeVisible()
    expect(body).toEqual({
      data: {
        type: 'applicant-accounts',
        attributes: {
          email: 'applicant@example.com',
          password: 'Secret1!',
        },
      },
    })
    expect(contentType).toBe('application/vnd.api+json')
  })

  it('explains that the email is already registered on 409', async () => {
    server.use(
      http.post(apiUrl, () =>
        HttpResponse.json(
          {
            errors: [
              {
                status: '409',
                code: 'email-already-registered',
                title: 'Email unavailable',
                detail: 'An account already exists for this email address.',
              },
            ],
          },
          { status: 409 },
        ),
      ),
    )

    const { user, email, password, confirmPassword, submit } = renderForm()
    await fillValidAccount(user, { email, password, confirmPassword })
    await user.click(submit)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An account with this email address already exists',
    )
    expect(screen.getByText('Create your account')).toBeVisible()
  })

  it('reports rate limiting accessibly', async () => {
    server.use(http.post(apiUrl, () => new HttpResponse(null, { status: 429 })))

    const { user, email, password, confirmPassword, submit } = renderForm()
    await fillValidAccount(user, { email, password, confirmPassword })
    await user.click(submit)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts',
    )
  })

  it('reports a network failure', async () => {
    server.use(http.post(apiUrl, () => HttpResponse.error()))

    const { user, email, password, confirmPassword, submit } = renderForm()
    await fillValidAccount(user, { email, password, confirmPassword })
    await user.click(submit)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not reach the service',
    )
  })

  it('shows field-level API validation messages beside the fields', async () => {
    server.use(
      http.post(apiUrl, () =>
        HttpResponse.json(
          {
            errors: [
              {
                status: '400',
                code: 'invalid-attribute',
                title: 'Invalid email',
                detail: 'Enter a valid email address.',
                source: { pointer: '/data/attributes/email' },
              },
            ],
          },
          { status: 400 },
        ),
      ),
    )

    const { user, email, password, confirmPassword, submit } = renderForm()
    await fillValidAccount(user, { email, password, confirmPassword })
    await user.click(submit)

    expect(
      await screen.findByText('Enter a valid email address.'),
    ).toBeVisible()
  })
})
