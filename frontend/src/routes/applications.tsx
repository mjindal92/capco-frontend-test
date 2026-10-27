import { Button } from '@kyc/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router'

import { signOutApplicant } from '../api/applicant-access'
import { ApiError } from '../api/client'

import styles from './applications-layout.module.css'

/**
 * Applicant journey shell. Logging out is offered here so the saved draft is always
 * re-read from the API on the next sign-in.
 */
export default function ApplicationsLayout() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [error, setError] = useState<string>()

  async function signOut(): Promise<void> {
    if (isSigningOut) return
    setIsSigningOut(true)
    setError(undefined)
    try {
      await signOutApplicant()
      // Cached draft answers are PII, so they must not outlive the session.
      queryClient.clear()
      void navigate('/sign-in', { replace: true })
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.kind === 'network'
          ? 'We could not reach the service. Check your connection and try again.'
          : 'You could not be signed out. Please try again.',
      )
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Button
          isPending={isSigningOut}
          onPress={() => void signOut()}
          variant="quiet"
        >
          {isSigningOut ? 'Signing out...' : 'Sign out'}
        </Button>
        {error ? (
          <p aria-live="assertive" className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </header>
      <Outlet />
    </div>
  )
}
