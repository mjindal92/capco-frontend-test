import {
  Alert,
  Button,
  Card,
  CardContent,
  Link,
  Stack,
  TextField,
  Typography,
} from '@kyc/ui'
import { useId, useRef, useState } from 'react'

import { defaultJourneyPath, signInApplicant } from '../api/applicant-access'
import { ApiError } from '../api/client'

import { accountAccessHref, isSafeJourneyPath } from './-return-target'
import styles from './account-access.module.css'

export interface SignInFormProps {
  onNavigate?: (href: string) => void
  returnTo?: string
}

const invalidCredentialsMessage =
  'The email or password you entered is incorrect. Please try again.'

function errorFor(failure: unknown): string {
  if (!(failure instanceof ApiError)) {
    return 'Sign-in could not be completed. Please try again.'
  }
  switch (failure.kind) {
    case 'authentication':
      return invalidCredentialsMessage
    case 'network':
      return 'We could not reach the service. Check your connection and try again.'
    case 'rate-limited':
      return 'Too many attempts. Please wait a moment and try again.'
    case 'validation':
      return 'Enter a valid email address and password.'
    default:
      return 'Sign-in could not be completed. Please try again.'
  }
}

export function SignInForm({ onNavigate, returnTo }: SignInFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [isPending, setIsPending] = useState(false)
  const errorSummaryId = useId()
  const errorAlert = useRef<HTMLDivElement>(null)

  async function submit(): Promise<void> {
    if (isPending) return

    // An empty form is rejected locally so it never consumes a sign-in attempt.
    const missing = !email.trim() || !password
    setError(missing ? 'Enter your email address and password.' : undefined)
    if (missing) {
      errorAlert.current?.focus()
      return
    }

    setIsPending(true)
    try {
      const journeyUrl = await signInApplicant({ email, password })
      // The API decides where the Applicant resumes. Both accepted destinations are local
      // routes: the form route it returned, or the landing page when none was usable.
      const destination =
        returnTo ??
        (isSafeJourneyPath(journeyUrl) ? journeyUrl : defaultJourneyPath)
      if (onNavigate) onNavigate(destination)
      else window.location.assign(destination)
    } catch (failure) {
      setPassword('')
      setError(errorFor(failure))
      // The email is intentionally kept so the Applicant can correct the password.
      errorAlert.current?.focus()
    } finally {
      setIsPending(false)
    }
  }

  return (
    <main className={styles.page}>
      <Card className={styles.card}>
        <CardContent className={styles.cardContent}>
          <form
            aria-busy={isPending}
            aria-describedby={error ? errorSummaryId : undefined}
            className={styles.formElement}
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <Stack spacing={1}>
              <Typography component="h1" variant="heading">
                Welcome back
              </Typography>
              <Typography tone="muted">
                Sign in to continue your KYC application.
              </Typography>
            </Stack>
            {error ? (
              <Alert
                id={errorSummaryId}
                aria-live="assertive"
                ref={errorAlert}
                severity="error"
                tabIndex={-1}
              >
                {error}
              </Alert>
            ) : null}
            <TextField
              autoComplete="email"
              disabled={isPending}
              fullWidth
              label="Email address"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
            <TextField
              autoComplete="current-password"
              disabled={isPending}
              fullWidth
              label="Password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
            <Button
              className={styles.submit}
              fullWidth
              isPending={isPending}
              size="large"
              type="submit"
            >
              {isPending ? 'Signing in...' : 'Sign in'}
            </Button>
            <Typography aria-live="polite" role="status" variant="caption">
              {isPending ? 'Signing in, please wait.' : ''}
            </Typography>
            <Typography
              className={styles.footer}
              align="center"
              variant="caption"
            >
              <span>New to KYC? </span>
              <Link
                href={accountAccessHref('/create-account', returnTo)}
                onClick={(event) => {
                  if (onNavigate) {
                    event.preventDefault()
                    onNavigate(accountAccessHref('/create-account', returnTo))
                  }
                }}
              >
                Create account
              </Link>
            </Typography>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
