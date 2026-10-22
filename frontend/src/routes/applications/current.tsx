import { Alert, Button, Link, Stack, Typography } from '@kyc/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { accountAccessHref, isSafeJourneyPath } from '../-return-target'
import {
  findCurrentApplication,
  startApplication,
  type CurrentDraft,
} from '../../api/application-form'
import { ApiError } from '../../api/client'
import styles from '../applicant-journey.module.css'

import {
  ApplicantJourneyPresentation,
  type ApplicantJourneyProgressItem,
} from './-applicant-journey-presentation'

import type { Route } from './+types/current'

const currentApplicationKey = ['current-application']
const landingPath = '/applications/current'

export function clientLoader({ request }: Route.ClientLoaderArgs) {
  const search = Object.fromEntries(new URL(request.url).searchParams)
  return {
    returnTo: typeof search.returnTo === 'string' ? search.returnTo : undefined,
  }
}

function errorMessage(failure: unknown): string {
  if (failure instanceof ApiError && failure.kind === 'network') {
    return 'We could not reach the service. Check your connection and try again.'
  }
  return 'Your application could not be opened. Please try again.'
}

/**
 * Resumes the saved draft at the step the API reports. When the Applicant has no draft
 * yet, one is started on request so answers can be saved and returned to later.
 */
export default function CurrentApplicationJourneyPage({
  loaderData,
}: Route.ComponentProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isStarting, setIsStarting] = useState(false)
  const [startError, setStartError] = useState<string>()
  const draftQuery = useQuery({
    // TanStack Query rejects undefined results, so "no draft" is modelled as null.
    queryFn: async () => (await findCurrentApplication()) ?? null,
    queryKey: currentApplicationKey,
    retry: false,
  })

  async function start(): Promise<void> {
    if (isStarting) return
    setIsStarting(true)
    setStartError(undefined)
    try {
      const draft: CurrentDraft = await startApplication()
      queryClient.setQueryData(currentApplicationKey, draft)
      // A new draft must not inherit a previously cached form or version.
      queryClient.removeQueries({ queryKey: ['application-form'] })
      if (!isSafeJourneyPath(draft.attributes.href)) {
        setStartError(errorMessage(undefined))
        return
      }
      navigate(draft.attributes.href)
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) {
        navigate(accountAccessHref('/sign-in', landingPath))
        return
      }
      setStartError(errorMessage(failure))
    } finally {
      setIsStarting(false)
    }
  }

  const failure = draftQuery.error
  if (failure instanceof ApiError && failure.status === 401) {
    return (
      <main className={styles.page}>
        <Stack spacing={2}>
          <Typography component="h1" variant="heading">
            Sign in to continue
          </Typography>
          <Link
            href={accountAccessHref(
              '/sign-in',
              loaderData.returnTo ?? landingPath,
            )}
          >
            Sign in
          </Link>
        </Stack>
      </main>
    )
  }

  if (draftQuery.isPending) {
    return (
      <main className={styles.page}>
        <Typography role="status">Loading your application...</Typography>
      </main>
    )
  }

  if (draftQuery.isError) {
    return (
      <main className={styles.page}>
        <Stack spacing={2}>
          <Typography component="h1" variant="heading">
            Your application could not be loaded
          </Typography>
          <Typography>Please try again in a moment.</Typography>
          <Button variant="secondary" onPress={() => void draftQuery.refetch()}>
            Try again
          </Button>
        </Stack>
      </main>
    )
  }

  const draft = draftQuery.data

  if (!draft) {
    return (
      <Stack spacing={2}>
        {startError ? (
          <Alert aria-live="assertive" severity="error">
            {startError}
          </Alert>
        ) : null}
        <ApplicantJourneyPresentation
          entryState="start"
          progress={[
            { step: 'personal-details', state: 'current' },
            { step: 'identity-and-address', state: 'remaining' },
          ]}
          isPrimaryActionPending={isStarting}
          onPrimaryAction={() => void start()}
        />
      </Stack>
    )
  }

  const progress: ApplicantJourneyProgressItem[] =
    draft.attributes.progress.map(({ step, state }) => ({
      step,
      state: state === 'not-started' ? 'remaining' : state,
    }))

  if (!isSafeJourneyPath(draft.attributes.href)) {
    return (
      <main className={styles.page}>
        <Stack spacing={2}>
          <Typography component="h1" variant="heading">
            Your application cannot be edited
          </Typography>
          <Typography>
            This application is no longer an open draft. Sign in again to check
            its status.
          </Typography>
          <Link href={accountAccessHref('/sign-in')}>Sign in</Link>
        </Stack>
      </main>
    )
  }

  return (
    <Stack spacing={2}>
      <ApplicantJourneyPresentation
        entryState="resume"
        progress={progress}
        onPrimaryAction={() => navigate(draft.attributes.href)}
      />
    </Stack>
  )
}
