import { describe, expect, it } from 'vitest'

import { isSafeJourneyPath } from './-return-target'

describe('sign-in destination selection', () => {
  const applicationId = '11111111-1111-5111-8111-111111111111'

  function destination(journeyUrl: string, returnTo?: string): string {
    return (
      returnTo ??
      (isSafeJourneyPath(journeyUrl) ? journeyUrl : '/applications/current')
    )
  }

  it('uses the API journey href when it is a form route', () => {
    expect(destination(`/applications/${applicationId}/personal-details`)).toBe(
      `/applications/${applicationId}/personal-details`,
    )
  })

  it('falls back to the landing page for the no-draft href', () => {
    expect(destination('/applications/current')).toBe('/applications/current')
  })

  it('prefers an explicit return target', () => {
    expect(
      destination(
        '/applications/current',
        `/applications/${applicationId}/identity-and-address`,
      ),
    ).toBe(`/applications/${applicationId}/identity-and-address`)
  })

  it('never yields a destination the router cannot serve', () => {
    for (const journeyUrl of [
      '/applications/current',
      `/applications/${applicationId}/personal-details`,
      '/api/v1/applicant-applications/prototype/form',
      'https://untrusted.example',
      '',
    ]) {
      const selected = destination(journeyUrl)
      expect(
        selected === '/applications/current' || isSafeJourneyPath(selected),
        `unexpected destination for ${journeyUrl}: ${selected}`,
      ).toBe(true)
    }
  })
})
