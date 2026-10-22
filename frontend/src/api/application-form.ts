import { z } from 'zod'

import { apiRequest } from './client'

export const stepSchema = z.enum(['personal-details', 'identity-and-address'])
export type Step = z.infer<typeof stepSchema>

/** Field names accepted by the form API, grouped by the step that owns them. */
export const stepFields = {
  'personal-details': [
    'name',
    'dateOfBirth',
    'country',
    'nationality',
    'email',
    'phone',
    'consentConfirmed',
  ],
  'identity-and-address': [
    'documentType',
    'documentNumber',
    'documentCountry',
    'expiry',
    'street',
    'city',
    'postal',
    'residentialCountry',
  ],
} as const satisfies Record<Step, readonly string[]>

export type FieldName = (typeof stepFields)[Step][number]

export const answersSchema = z.object({
  name: z.string().nullable().default(null),
  dateOfBirth: z.string().nullable().default(null),
  country: z.string().nullable().default(null),
  nationality: z.string().nullable().default(null),
  email: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  consentConfirmed: z.boolean().nullable().default(null),
  documentType: z.string().nullable().default(null),
  documentNumber: z.string().nullable().default(null),
  documentCountry: z.string().nullable().default(null),
  expiry: z.string().nullable().default(null),
  street: z.string().nullable().default(null),
  city: z.string().nullable().default(null),
  postal: z.string().nullable().default(null),
  residentialCountry: z.string().nullable().default(null),
})
/** Field values accepted by the form API. */
export type Answers = Partial<Record<FieldName, string | boolean | null>>

const formDocumentSchema = z.object({
  type: z.literal('applicant-application-forms'),
  attributes: z.object({
    currentStep: stepSchema,
    answers: answersSchema,
    documentEvidence: z.object({ present: z.boolean() }),
    version: z.number().int().min(0),
  }),
})
export type DraftForm = z.infer<typeof formDocumentSchema>

const applicationDocumentSchema = z.object({
  id: z.string(),
  attributes: z.object({
    status: z.literal('draft'),
    currentStep: stepSchema,
    href: z.string(),
    progress: z.array(
      z.object({
        step: stepSchema,
        state: z.enum(['not-started', 'current', 'complete']),
      }),
    ),
  }),
})
export type CurrentDraft = z.infer<typeof applicationDocumentSchema>

/** Returns the current draft, or undefined when the Applicant has not started one (204). */
export async function findCurrentApplication(): Promise<
  CurrentDraft | undefined
> {
  return apiRequest(
    '/api/v1/applicant-applications/current',
    applicationDocumentSchema,
  )
}

/**
 * Starts the Applicant's draft, or returns the existing one. The endpoint is idempotent,
 * so repeated activations never create duplicate drafts.
 */
export function startApplication(): Promise<CurrentDraft> {
  return apiRequest(
    '/api/v1/applicant-applications',
    applicationDocumentSchema,
    { method: 'POST' },
  )
}

/** Returns the saved form for an application, including every answer and the version. */
export function getApplicationForm(applicationId: string): Promise<DraftForm> {
  return apiRequest(
    `/api/v1/applicant-applications/${encodeURIComponent(applicationId)}/form`,
    formDocumentSchema,
  )
}

export interface SaveFormInput {
  applicationId: string
  step: Step
  answers: Answers
  version: number
}

/** Saves one step's answers and returns the persisted form state, including the new version. */
export function saveApplicationForm({
  applicationId,
  step,
  answers,
  version,
}: SaveFormInput): Promise<DraftForm> {
  return apiRequest(
    `/api/v1/applicant-applications/${encodeURIComponent(applicationId)}/form`,
    formDocumentSchema,
    {
      method: 'PATCH',
      body: {
        data: {
          type: 'applicant-application-forms',
          attributes: { step, answers, version },
        },
      },
    },
  )
}
