import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Link,
  Stack,
  TextField,
  Typography,
} from '@kyc/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'

import { accountAccessHref, APPLICATION_ID_PATTERN } from '../../-return-target'
import {
  getApplicationForm,
  saveApplicationForm,
  stepFields,
  type Answers,
  type FieldName,
  type Step,
} from '../../../api/application-form'
import { ApiError, fieldNameFromPointer } from '../../../api/client'
import styles from '/src/routes/application-step.module.css'

import type { Route } from './+types/$step'

type FormValues = Partial<Record<FieldName, string | boolean>>
type FieldErrors = Partial<Record<FieldName, string>>

const labels: Record<FieldName, string> = {
  name: 'Full name',
  dateOfBirth: 'Date of birth',
  country: 'Country of residence',
  nationality: 'Nationality',
  email: 'Email address',
  phone: 'Phone number',
  consentConfirmed: 'I confirm these details are accurate and belong to me.',
  documentType: 'Document type',
  documentNumber: 'Document number',
  documentCountry: 'Document country',
  expiry: 'Expiry date',
  street: 'Street address',
  city: 'City',
  postal: 'Postal code',
  residentialCountry: 'Residential country',
}

const dateFields = new Set<FieldName>(['dateOfBirth', 'expiry'])
const checkboxFields = new Set<FieldName>(['consentConfirmed'])

const stepTitles: Record<Step, string> = {
  'personal-details': 'Personal details',
  'identity-and-address': 'Identity and address',
}

/** Copies the saved answers for one step into form state, normalising nulls to empty values. */
function valuesFromAnswers(step: Step, answers: Answers): FormValues {
  const values: FormValues = {}
  for (const field of stepFields[step]) {
    const saved = answers[field]
    values[field] = typeof saved === 'boolean' ? saved : (saved ?? '')
  }
  return values
}

function saveFailureMessage(failure: ApiError | Error): string {
  switch (failure instanceof ApiError ? failure.kind : 'unexpected') {
    case 'authentication':
      return 'Your session has expired. Sign in again to continue.'
    case 'network':
      return 'We could not reach the service. Your answers are still on this page; try again.'
    case 'conflict':
      return 'This application was updated elsewhere. Reload the latest version, then save again.'
    case 'validation':
      return 'Some answers are not valid. Check the highlighted fields and try again.'
    case 'rate-limited':
      return 'Too many requests. Please wait a moment and try again.'
    default:
      return 'Your answers could not be saved. Please try again.'
  }
}

export default function CurrentApplicationStepPage({
  params,
}: Route.ComponentProps) {
  const navigate = useNavigate()
  const applicationId = params.applicationId
  const step: Step =
    params.step === 'identity-and-address'
      ? 'identity-and-address'
      : 'personal-details'

  if (!APPLICATION_ID_PATTERN.test(applicationId)) {
    return (
      <main className={styles.page}>
        <Box component="div" className={styles.stepContent}>
          <Stack spacing={2}>
            <Typography component="h1" variant="heading">
              This application could not be found
            </Typography>
            <Button
              onPress={() => void navigate('/applications/current')}
              variant="secondary"
            >
              Back to your application
            </Button>
          </Stack>
        </Box>
      </main>
    )
  }

  return <ApplicationStepForm applicationId={applicationId} step={step} />
}

interface StepFormProps {
  applicationId: string
  step: Step
  formQuery: ReturnType<typeof useFormQuery>
}

function useFormQuery(applicationId: string) {
  return useQuery({
    queryKey: ['application-form', applicationId],
    queryFn: () => getApplicationForm(applicationId),
    // The cached form is shared by every step, so it must never be treated as fresh.
    staleTime: 0,
    retry: false,
  })
}

function ApplicationStepForm({
  applicationId,
  step,
}: {
  applicationId: string
  step: Step
}) {
  const formQuery = useFormQuery(applicationId)
  return (
    <StepForm
      key={`${applicationId}-${step}`}
      applicationId={applicationId}
      formQuery={formQuery}
      step={step}
    />
  )
}

function StepForm({ applicationId, step, formQuery }: StepFormProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [version, setVersion] = useState<number>()
  const [values, setValues] = useState<FormValues>()
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  const [saveConfirmation, setSaveConfirmation] = useState<string>()
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [isSessionExpired, setIsSessionExpired] = useState(false)
  const [isConflicted, setIsConflicted] = useState(false)

  // Load the saved draft once it arrives; saves afterwards replace both values and version.
  if (formQuery.data && version === undefined && values === undefined) {
    setVersion(formQuery.data.attributes.version)
    setValues(valuesFromAnswers(step, formQuery.data.attributes.answers))
  }

  const loadFailure = formQuery.error
  const signedOut =
    isSessionExpired ||
    (loadFailure instanceof ApiError && loadFailure.status === 401)
  const signInHref = accountAccessHref(
    '/sign-in',
    `/applications/${applicationId}/${step}`,
  )

  if (signedOut) {
    return (
      <main className={styles.page}>
        <Box component="div" className={styles.stepContent}>
          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Typography component="h1" variant="heading">
                  Your session has expired
                </Typography>
                <Typography>
                  Sign in again to continue your saved application. Any changes
                  you have not saved yet are still on this page and will be
                  replaced when it reloads.
                </Typography>
                <Link href={signInHref}>Sign in</Link>
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </main>
    )
  }

  if (formQuery.isPending) {
    return (
      <main className={styles.page}>
        <Box component="div" className={styles.stepContent}>
          <Typography role="status">Loading your saved answers...</Typography>
        </Box>
      </main>
    )
  }

  if (formQuery.isError || !values) {
    return (
      <main className={styles.page}>
        <Box component="div" className={styles.stepContent}>
          <Stack spacing={2}>
            <Alert severity="error">
              {loadFailure instanceof ApiError && loadFailure.status === 404
                ? 'This application could not be found.'
                : 'Your saved application could not be loaded.'}
            </Alert>
            <Button
              variant="secondary"
              onPress={() => void formQuery.refetch()}
            >
              Try again
            </Button>
          </Stack>
        </Box>
      </main>
    )
  }

  const updateValue = (field: FieldName, value: string | boolean) => {
    setValues((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
    setSaveConfirmation(undefined)
  }

  /** Re-reads the form so a conflicted save can be retried against the current version. */
  async function reloadLatest(): Promise<void> {
    const result = await formQuery.refetch()
    if (!result.data) return
    setVersion(result.data.attributes.version)
    setValues(valuesFromAnswers(step, result.data.attributes.answers))
    setFieldErrors({})
    setIsConflicted(false)
    setSaveError(undefined)
    setSaveConfirmation(undefined)
  }

  async function save(): Promise<void> {
    if (isSaving) return
    const answers: Answers = {}
    const errors: FieldErrors = {}
    for (const field of stepFields[step]) {
      const value = values?.[field]
      if (checkboxFields.has(field)) {
        answers[field] = value === true
        continue
      }
      const text = typeof value === 'string' ? value.trim() : ''
      if (!text) errors[field] = 'This field is required.'
      answers[field] = text
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setSaveError('Complete the required fields before saving.')
      setSaveConfirmation(undefined)
      return
    }

    setSaveError(undefined)
    setSaveConfirmation(undefined)
    setIsConflicted(false)
    setIsSaving(true)
    try {
      const saved = await saveApplicationForm({
        applicationId,
        step,
        answers,
        version: version ?? 0,
      })
      setVersion(saved.attributes.version)
      // Share the confirmed state so the next step starts from the bumped version.
      queryClient.setQueryData(['application-form', applicationId], saved)
      setSaveConfirmation('Your answers were saved.')
      // The API decides which step is now current; only a confirmed save advances.
      const nextStep = saved.attributes.currentStep
      if (nextStep !== step) {
        navigate(`/applications/${applicationId}/${nextStep}`)
      }
    } catch (failure) {
      // Entered values are deliberately kept so the Applicant can retry.
      if (failure instanceof ApiError) {
        if (failure.status === 401) {
          setIsSessionExpired(true)
          return
        }
        if (failure.kind === 'conflict') {
          setIsConflicted(true)
        }
        const fromApi: FieldErrors = {}
        for (const fieldError of failure.fieldErrors) {
          const field = fieldNameFromPointer(fieldError.pointer) as FieldName
          fromApi[field] = fieldError.message
        }
        setFieldErrors(fromApi)
      }
      setSaveError(saveFailureMessage(failure as Error))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <main className={styles.page}>
      <Box component="div" className={styles.stepContent}>
        <Stack spacing={3}>
          <Typography component="p" variant="eyebrow" tone="accent">
            STEP {step === 'personal-details' ? '1' : '2'} OF 2
          </Typography>
          <Typography component="h1" variant="heading">
            {stepTitles[step]}
          </Typography>
          <Typography tone="muted">
            Your answers are saved to your application so you can return later.
          </Typography>
          {saveError ? (
            <Alert aria-live="assertive" severity="error">
              {saveError}
              {isConflicted ? (
                <Stack component="div" direction="row" spacing={1}>
                  <Button
                    onPress={() => void reloadLatest()}
                    size="small"
                    variant="secondary"
                  >
                    Reload latest
                  </Button>
                </Stack>
              ) : null}
            </Alert>
          ) : null}
          {saveConfirmation ? (
            <Alert aria-live="polite" severity="success">
              {saveConfirmation}
            </Alert>
          ) : null}
          <form
            aria-busy={isSaving}
            className={styles.formElement}
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            {stepFields[step].map((field) =>
              checkboxFields.has(field) ? (
                <TextField
                  disabled={isSaving}
                  error={Boolean(fieldErrors[field])}
                  helperText={fieldErrors[field]}
                  key={field}
                  label={labels[field]}
                  name={field}
                  onChange={(event) => updateValue(field, event.target.checked)}
                  type="checkbox"
                  value=""
                  {...(values[field] === true ? { checked: true } : {})}
                />
              ) : (
                <TextField
                  autoComplete="off"
                  disabled={isSaving}
                  error={Boolean(fieldErrors[field])}
                  helperText={fieldErrors[field]}
                  key={field}
                  label={labels[field]}
                  name={field}
                  onChange={(event) => updateValue(field, event.target.value)}
                  required
                  type={dateFields.has(field) ? 'date' : 'text'}
                  value={typeof values[field] === 'string' ? values[field] : ''}
                />
              ),
            )}
            <Stack
              component="div"
              className={styles.formActions}
              direction="row"
              spacing={2}
            >
              <Button
                onPress={() =>
                  step === 'personal-details'
                    ? void navigate('/applications/current')
                    : void navigate(
                        `/applications/${applicationId}/personal-details`,
                      )
                }
                type="button"
                variant="quiet"
              >
                Back
              </Button>
              <Button isPending={isSaving} type="submit">
                {step === 'personal-details' ? 'Save and continue' : 'Save'}
              </Button>
            </Stack>
          </form>
        </Stack>
      </Box>
    </main>
  )
}
