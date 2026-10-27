import {
  stepFields,
  type Answers,
  type FieldName,
  type Step,
} from './application-form'

/** Editable values for one form step, normalised so inputs never receive `null`. */
export type FormValues = Partial<Record<FieldName, string | boolean>>
export type FieldErrors = Partial<Record<FieldName, string>>

const checkboxFields = new Set<FieldName>(['consentConfirmed'])

export function isCheckboxField(field: FieldName): boolean {
  return checkboxFields.has(field)
}

/** Copies the saved answers for one step into form state. */
export function valuesFromAnswers(step: Step, answers: Answers): FormValues {
  const values: FormValues = {}
  for (const field of stepFields[step]) {
    const saved = answers[field]
    values[field] = isCheckboxField(field) ? saved === true : (saved ?? '')
  }
  return values
}

/**
 * Converts the edited values for a step into API answers. Empty text is sent as an empty
 * string so a partial draft persists; only `validateForSubmit` treats it as missing.
 */
export function answersFromValues(
  step: Step,
  values: FormValues,
): { answers: Answers; errors: FieldErrors } {
  const answers: Answers = {}
  const errors: FieldErrors = {}
  for (const field of stepFields[step]) {
    const value = values[field]
    if (isCheckboxField(field)) {
      answers[field] = value === true
      continue
    }
    const text = typeof value === 'string' ? value.trim() : ''
    if (!text) errors[field] = 'This field is required.'
    answers[field] = text
  }
  return { answers, errors }
}

/**
 * A draft may be saved at any point, so only continuing to the next step requires
 * every field on the current step to be answered.
 */
export function validateForSubmit(step: Step, values: FormValues): FieldErrors {
  return answersFromValues(step, values).errors
}
