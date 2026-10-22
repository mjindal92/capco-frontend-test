import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TextField } from './Primitives'

function childrenOf(control: HTMLElement): Element[] {
  return Array.from(control.parentElement?.children ?? [])
}

describe('TextField as a checkbox', () => {
  it('renders the control inline to the left of its label', () => {
    render(
      <TextField
        label="I confirm these details are accurate"
        name="consent"
        type="checkbox"
      />,
    )

    const checkbox = screen.getByRole('checkbox', {
      name: 'I confirm these details are accurate',
    })
    const [first, second] = childrenOf(checkbox)

    // The control comes first in a shared row, so it renders to the left of the text.
    expect(first).toBe(checkbox)
    expect(second?.tagName).toBe('LABEL')
    expect(second?.textContent).toBe('I confirm these details are accurate')
    expect(checkbox.parentElement?.className).toContain('checkboxField')
    expect(second?.className).toContain('checkboxLabel')
  })

  it('styles the checkbox with a usable size', () => {
    render(<TextField label="Consent" name="consent" type="checkbox" />)

    const checkbox = screen.getByRole('checkbox', { name: 'Consent' })
    expect(checkbox.getAttribute('type')).toBe('checkbox')
    expect(checkbox.className).toContain('checkbox')
  })

  it('keeps text fields stacked with the label above the input', () => {
    render(<TextField label="Full name" name="name" />)

    const input = screen.getByLabelText('Full name')
    const [first] = childrenOf(input)

    // Text fields are unchanged: label first, then the input, and no checkbox layout.
    expect(first?.tagName).toBe('LABEL')
    expect(input.className).not.toContain('checkbox')
    expect(input.parentElement?.className).not.toContain('checkboxField')
  })

  it('marks the checkbox invalid and shows the error message', () => {
    render(
      <TextField
        error
        helperText="You must confirm these details."
        label="Consent"
        name="consent"
        type="checkbox"
      />,
    )

    const checkbox = screen.getByRole('checkbox', { name: 'Consent' })
    expect(checkbox.getAttribute('data-invalid')).toBe('true')
    expect(screen.getByText('You must confirm these details.')).toBeDefined()
  })
})
