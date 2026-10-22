import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createRoutesStub } from 'react-router'
import { describe, expect, it } from 'vitest'

import { server } from '../test/server'

import ApplicationsLayout from './applications'

function renderLayout() {
  const Stub = createRoutesStub([
    {
      path: '/applications',
      Component: ApplicationsLayout,
      children: [{ index: true, Component: () => <p>Journey content</p> }],
    },
    { path: '/sign-in', Component: () => <p>Sign in page</p> },
  ])
  render(<Stub initialEntries={['/applications']} />)
  return userEvent.setup()
}

describe('ApplicationsLayout sign out', () => {
  it('revokes the session and returns to the sign-in page', async () => {
    let method: string | undefined
    let csrfHeader: string | null = null
    server.use(
      http.delete('/api/v1/applicant-sessions/current', ({ request }) => {
        method = request.method
        csrfHeader = request.headers.get('X-XSRF-TOKEN')
        return new HttpResponse(null, { status: 204 })
      }),
    )
    document.cookie = 'XSRF-TOKEN=token-abc'

    const user = renderLayout()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(await screen.findByText('Sign in page')).toBeVisible()
    expect(method).toBe('DELETE')
    expect(csrfHeader).toBe('token-abc')
  })

  it('reports a failed sign out and stays on the page', async () => {
    server.use(
      http.delete('/api/v1/applicant-sessions/current', () =>
        HttpResponse.error(),
      ),
    )

    const user = renderLayout()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not reach the service',
    )
    expect(screen.getByText('Journey content')).toBeVisible()
  })

  it('treats an already-ended session as signed out', async () => {
    server.use(
      http.delete(
        '/api/v1/applicant-sessions/current',
        () => new HttpResponse(null, { status: 401 }),
      ),
    )

    const user = renderLayout()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    await waitFor(() => expect(screen.getByText('Sign in page')).toBeVisible())
  })
})
