import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => cleanup())

// jsdom has no object URLs; photos are shown from them.
let objectUrls = 0
URL.createObjectURL = vi.fn(() => `blob:test/${++objectUrls}`)
URL.revokeObjectURL = vi.fn()
