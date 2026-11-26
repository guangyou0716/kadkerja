import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// The language choice is kept in localStorage: start every test without one (English, as jsdom's device).
afterEach(() => {
  cleanup()
  globalThis.localStorage?.removeItem('kadkerja.lang') // not in node-environment tests (build.test.ts)
})

// jsdom has no object URLs; photos are shown from them.
let objectUrls = 0
URL.createObjectURL = vi.fn(() => `blob:test/${++objectUrls}`)
URL.revokeObjectURL = vi.fn()
