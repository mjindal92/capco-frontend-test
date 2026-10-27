import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'

if (!globalThis.CSS) {
  Object.defineProperty(globalThis, 'CSS', { configurable: true, value: {} })
}

if (typeof CSS.escape !== 'function') {
  Object.defineProperty(CSS, 'escape', {
    configurable: true,
    value: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, '\\$&'),
  })
}

afterEach(cleanup)
