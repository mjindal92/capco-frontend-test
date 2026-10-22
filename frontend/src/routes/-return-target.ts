export interface AccountAccessSearch {
  returnTo?: string
}

/** Restricts post-authentication navigation to local applicant journey paths. */
export function parseAccountAccessSearch(
  search: Record<string, unknown>,
): AccountAccessSearch {
  const returnTo = search.returnTo
  return typeof returnTo === 'string' && isSafeJourneyPath(returnTo)
    ? { returnTo }
    : {}
}

/** Application ids are UUIDs in the API contract. */
export const APPLICATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Restricts navigation to applicant form routes, which use UUID application ids. */
export function isSafeJourneyPath(path: string): boolean {
  return /^\/applications\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(personal-details|identity-and-address)$/i.test(
    path,
  )
}

export function accountAccessHref(
  path: '/sign-in' | '/create-account',
  returnTo?: string,
): string {
  return returnTo ? `${path}?returnTo=${encodeURIComponent(returnTo)}` : path
}
