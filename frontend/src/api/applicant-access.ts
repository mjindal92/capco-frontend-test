import { z } from 'zod'

import { apiRequest, ApiError } from './client'

/** The backend falls back to this path when the Applicant has no draft. */
export const defaultJourneyPath = '/applications/current'

/**
 * The journey destination is advisory: a session that was established must still be
 * honoured, so an unexpected body falls back to the landing page instead of failing sign-in.
 */
function readJourney(attributes: unknown): string {
  if (
    typeof attributes === 'object' &&
    attributes !== null &&
    'href' in attributes &&
    typeof attributes.href === 'string' &&
    attributes.href.startsWith('/')
  ) {
    return attributes.href
  }
  return defaultJourneyPath
}

export interface Credentials {
  email: string
  password: string
}

/** Contract password policy: at least six characters, one uppercase letter, one special character. */
export const passwordPolicy = {
  minimumLength: 6,
  uppercase: /[A-Z]/,
  specialCharacter: /[^A-Za-z0-9]/,
} as const

export function validatePassword(password: string): string | undefined {
  if (password.length < passwordPolicy.minimumLength) {
    return `Use at least ${passwordPolicy.minimumLength} characters.`
  }
  if (!passwordPolicy.uppercase.test(password)) {
    return 'Include at least one uppercase letter.'
  }
  if (!passwordPolicy.specialCharacter.test(password)) {
    return 'Include at least one special character.'
  }
  return undefined
}

export const passwordGuidance =
  'Use at least six characters, including one uppercase letter and one special character.'

/** Registration creates the account only; it never establishes a session. */
export async function registerApplicant(
  credentials: Credentials,
): Promise<void> {
  await apiRequest('/api/v1/applicant-accounts', z.unknown(), {
    method: 'POST',
    body: {
      data: { type: 'applicant-accounts', attributes: credentials },
    },
  })
}

/** Returns the journey URL the API assigned to the newly established session. */
export async function signInApplicant(
  credentials: Credentials,
): Promise<string> {
  const session = await apiRequest(
    '/api/v1/applicant-sessions',
    z.object({ type: z.string(), attributes: z.unknown() }),
    {
      method: 'POST',
      body: { data: { type: 'applicant-sessions', attributes: credentials } },
    },
  )
  return readJourney(session.attributes)
}

/** Revokes the current session and clears its cookies; safe to call when already signed out. */
export async function signOutApplicant(): Promise<void> {
  try {
    await apiRequest('/api/v1/applicant-sessions/current', z.unknown(), {
      method: 'DELETE',
    })
  } catch (failure) {
    // An already-expired session is the desired end state, so it is not an error here.
    if (!(failure instanceof ApiError) || failure.status !== 401) throw failure
  }
}
