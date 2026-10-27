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
import { useId, useState } from 'react'

import {
  passwordGuidance,
  registerApplicant,
  validatePassword,
} from '../api/applicant-access'
import { ApiError, fieldNameFromPointer } from '../api/client'

import { accountAccessHref } from './-return-target'
import styles from './account-access.module.css'

export interface CreateAccountFormProps {
  onNavigate?: (href: string) => void
  returnTo?: string
}

type FieldKey = 'email' | 'password' | 'confirmPassword'
type FieldErrors = Partial<Record<FieldKey, string>>

function errorFor(failure: unknown): string {
  if (!(failure instanceof ApiError)) {
    return 'Something went wrong. Please try again.'
  }
  switch (failure.kind) {
    case 'network':
      return 'We could not reach the service. Check your connection and try again.'
    case 'rate-limited':
      return 'Too many attempts. Please wait a moment and try again.'
    case 'conflict':
      return 'An account with this email address already exists. Try signing in instead.'
    case 'validation':
      return 'Check the highlighted fields and try again.'
    default:
      return 'Something went wrong. Please try again.'
  }
}

export function CreateAccountForm({
  onNavigate,
  returnTo,
}: CreateAccountFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [error, setError] = useState<string>()
  const [isPending, setIsPending] = useState(false)
  const [isCreated, setIsCreated] = useState(false)
  const errorSummaryId = useId()

  async function submit(): Promise<void> {
    if (isPending) return

    const errors: FieldErrors = {}
    const trimmedEmail = email.trim()
    if (!trimmedEmail) errors.email = 'Email address is required.'
    const passwordError = validatePassword(password)
    if (passwordError) errors.password = passwordError
    if (confirmPassword !== password) {
      errors.confirmPassword = 'Passwords do not match.'
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setError('Check the highlighted fields and try again.')
      return
    }

    setFieldErrors({})
    setError(undefined)
    setIsPending(true)
    try {
      await registerApplicant({ email: trimmedEmail, password })
      setPassword('')
      setConfirmPassword('')
      setIsCreated(true)
    } catch (failure) {
      if (failure instanceof ApiError) {
        const fromApi: FieldErrors = {}
        for (const fieldError of failure.fieldErrors) {
          const field = fieldNameFromPointer(fieldError.pointer)
          if (field === 'email' || field === 'password') {
            fromApi[field] = fieldError.message
          }
        }
        setFieldErrors(fromApi)
      }
      setError(errorFor(failure))
    } finally {
      setIsPending(false)
    }
  }

  const signInHref = accountAccessHref('/sign-in', returnTo)

  if (isCreated) {
    return (
      <main className={styles.page}>
        <Card className={styles.card}>
          <CardContent className={styles.cardContent}>
            <Stack spacing={3}>
              <Stack spacing={1}>
                <Typography component="h1" variant="heading">
                  Account created
                </Typography>
                <Typography tone="muted">
                  Sign in with your new details to start your KYC application.
                </Typography>
              </Stack>
              <Button
                className={styles.submit}
                fullWidth
                onPress={() => {
                  if (onNavigate) onNavigate(signInHref)
                  else window.location.assign(signInHref)
                }}
              >
                Go to sign in
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </main>
    )
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
                Create your account
              </Typography>
              <Typography tone="muted">
                Create credentials to begin your KYC application.
              </Typography>
            </Stack>
            {error ? (
              <Alert id={errorSummaryId} aria-live="assertive" severity="error">
                {error}
              </Alert>
            ) : null}
            <TextField
              autoComplete="email"
              disabled={isPending}
              error={Boolean(fieldErrors.email)}
              fullWidth
              helperText={fieldErrors.email}
              label="Email address"
              name="email"
              onChange={(event) => {
                setEmail(event.target.value)
                setFieldErrors((current) => ({ ...current, email: undefined }))
              }}
              required
              type="email"
              value={email}
            />
            <TextField
              autoComplete="new-password"
              disabled={isPending}
              error={Boolean(fieldErrors.password)}
              fullWidth
              helperText={fieldErrors.password ?? passwordGuidance}
              label="Password"
              name="password"
              onChange={(event) => {
                setPassword(event.target.value)
                setFieldErrors((current) => ({
                  ...current,
                  password: undefined,
                }))
              }}
              required
              type="password"
              value={password}
            />
            <TextField
              autoComplete="new-password"
              disabled={isPending}
              error={Boolean(fieldErrors.confirmPassword)}
              fullWidth
              helperText={fieldErrors.confirmPassword}
              label="Confirm password"
              name="confirmPassword"
              onChange={(event) => {
                setConfirmPassword(event.target.value)
                setFieldErrors((current) => ({
                  ...current,
                  confirmPassword: undefined,
                }))
              }}
              required
              type="password"
              value={confirmPassword}
            />
            <Button
              className={styles.submit}
              fullWidth
              isPending={isPending}
              size="large"
              type="submit"
            >
              {isPending ? 'Creating account...' : 'Create account'}
            </Button>
            <Typography
              className={styles.footer}
              align="center"
              variant="caption"
            >
              <span>Already have an account? </span>
              <Link
                href={signInHref}
                onClick={(event) => {
                  if (onNavigate) {
                    event.preventDefault()
                    onNavigate(signInHref)
                  }
                }}
              >
                Sign in
              </Link>
            </Typography>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
