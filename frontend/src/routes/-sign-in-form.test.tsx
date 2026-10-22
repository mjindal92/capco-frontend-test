import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'

import { server } from '../test/server'

import { SignInForm } from './-sign-in-form'

const apiUrl = '/api/v1/applicant-sessions'

const sessionDocument = {
  data: {
    type: 'applicant-sessions',
    id: 'session-1',
    attributes: {
      href: '/applications/11111111-1111-5111-8111-111111111111/personal-details',
    },
  },
}

async function submitCredentials(
  response: () => Response | Promise<Response>,
  props: { returnTo?: string } = {},
) {
  let body: unknown
  server.use(
    http.post(apiUrl, async ({ request }) => {
      body = await request.json()
      return response()
    }),
  )

  const onNavigate = vi.fn()
  render(<SignInForm onNavigate={onNavigate} {...props} />)
  const user = userEvent.setup()
  await user.type(
    screen.getByLabelText('Email address'),
    'applicant@example.com',
  )
  await user.type(screen.getByLabelText('Password'), 'Secret1!')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))

  return { body, onNavigate, user }
}

describe('SignInForm', () => {
  it('navigates to the journey href returned by the API', async () => {
    const { body, onNavigate } = await submitCredentials(() =>
      HttpResponse.json(sessionDocument, { status: 201 }),
    )

    expect(onNavigate).toHaveBeenCalledWith(
      '/applications/11111111-1111-5111-8111-111111111111/personal-details',
    )
    expect(body).toEqual({
      data: {
        type: 'applicant-sessions',
        attributes: { email: 'applicant@example.com', password: 'Secret1!' },
      },
    })
  })

  it('signs in even when the session body is not the expected shape', async () => {
    const { onNavigate } = await submitCredentials(() =>
      HttpResponse.json(
        { data: { type: 'applicant-sessions', attributes: {} } },
        { status: 201 },
      ),
    )

    // The session cookie is already set, so the Applicant must still move forward.
    await waitFor(() =>
      expect(onNavigate).toHaveBeenCalledWith('/applications/current'),
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('prefers an explicit return target over the API journey URL', async () => {
    const { onNavigate } = await submitCredentials(
      () => HttpResponse.json(sessionDocument, { status: 201 }),
      {
        returnTo:
          '/applications/abc12345-1111-5111-8111-111111111111/personal-details',
      },
    )

    expect(onNavigate).toHaveBeenCalledWith(
      '/applications/abc12345-1111-5111-8111-111111111111/personal-details',
    )
  })

  it('shows one generic error for invalid credentials and keeps the email', async () => {
    const { onNavigate } = await submitCredentials(() =>
      HttpResponse.json(
        {
          errors: [
            {
              status: '401',
              code: 'invalid-credentials',
              title: 'Authentication failed',
              detail: 'The email or password is incorrect.',
            },
          ],
        },
        { status: 401 },
      ),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The email or password you entered is incorrect.',
    )
    expect(screen.getByLabelText('Email address')).toHaveValue(
      'applicant@example.com',
    )
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('prevents duplicate submissions while a request is pending', async () => {
    let resolveResponse: (() => void) | undefined
    server.use(
      http.post(
        apiUrl,
        () =>
          new Promise<Response>((resolve) => {
            resolveResponse = () =>
              resolve(HttpResponse.json(sessionDocument, { status: 201 }))
          }),
      ),
    )

    render(<SignInForm />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email address'), 'a@b.co')
    await user.type(screen.getByLabelText('Password'), 'Secret1!')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    const pending = screen.getByRole('button', { name: 'Signing in...' })
    expect(pending).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('status')).toHaveTextContent(
      'Signing in, please wait.',
    )
    await user.click(pending)
    resolveResponse?.()
  })

  it('reports rate limiting', async () => {
    await submitCredentials(() => new HttpResponse(null, { status: 429 }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts',
    )
  })

  it('reports a network failure', async () => {
    await submitCredentials(() => HttpResponse.error())

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not reach the service',
    )
  })
})
