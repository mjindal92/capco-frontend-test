import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Checkbox, TextField } from './Primitives'

function childrenOf(control: HTMLElement): Element[] {
  return Array.from(control.parentElement?.children ?? [])
}

/** The visible box; the native input itself stays clipped for assistive technology. */
function visibleControl(): HTMLElement {
  const control = document.querySelector('[data-visible-control]')
  if (!(control instanceof HTMLElement)) {
    throw new Error('The visible checkbox control is missing')
  }
  return control
}

describe('Checkbox', () => {
  it('exposes a checkbox role with its label', () => {
    render(<Checkbox label="I confirm these details are accurate" />)

    const checkbox = screen.getByRole('checkbox', {
      name: 'I confirm these details are accurate',
    })
    expect(checkbox.getAttribute('type')).toBe('checkbox')
  })

  it('draws a visible control before the label', () => {
    render(<Checkbox label="Consent" />)

    const control = visibleControl()
    const label = screen.getByText('Consent')

    expect(control.compareDocumentPosition(label)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('marks the control as selected', () => {
    render(<Checkbox isSelected label="Consent" />)

    const input = screen.getByRole('checkbox') as HTMLInputElement
    // The styling hangs off this attribute, so it decides whether the box looks checked.
    expect(visibleControl().closest('[data-selected]')).not.toBeNull()
    expect(input.checked).toBe(true)
  })

  it('toggles and shows the checked state when the label is clicked', async () => {
    const user = userEvent.setup()
    render(<Checkbox label="Consent" />)

    const checkbox = screen.getByRole('checkbox', {
      name: 'Consent',
    }) as HTMLInputElement

    expect(checkbox).not.toBeChecked()

    await user.click(screen.getByText('Consent'))

    expect(checkbox).toBeChecked()
    expect(visibleControl().closest('[data-selected]')).not.toBeNull()
    expect(visibleControl().textContent).toBe('✓')
  })

  it('marks the checkbox invalid and shows the error message', () => {
    render(
      <Checkbox
        error
        helperText="You must confirm these details."
        label="Consent"
      />,
    )

    const checkbox = screen.getByRole('checkbox', { name: /Consent/ })
    // The invalid state is announced on the field wrapper, which owns the message.
    expect(checkbox.closest('[data-invalid="true"]')).not.toBeNull()
    expect(screen.getByText('You must confirm these details.')).toBeDefined()
  })
})

describe('TextField', () => {
  it('keeps text fields stacked with the label above the input', () => {
    render(<TextField label="Full name" name="name" />)

    const input = screen.getByLabelText('Full name')
    const [first] = childrenOf(input)

    expect(first?.tagName).toBe('LABEL')
    expect(input.className).not.toContain('checkbox')
    expect(input.parentElement?.className).not.toContain('checkboxField')
  })
})
