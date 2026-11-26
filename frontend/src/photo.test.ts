import { describe, expect, it } from 'vitest'
import { photoProblem, shrinkPhoto } from './photo'

describe('photo checks', () => {
  it('accepts JPEG and PNG only, up to 25 MB before shrinking', () => {
    expect(photoProblem(new File(['x'], 'a.jpg', { type: 'image/jpeg' }))).toBeNull()
    expect(photoProblem(new File(['x'], 'a.png', { type: 'image/png' }))).toBeNull()
    for (const type of ['image/gif', 'image/svg+xml', 'image/heic', 'text/html', '']) {
      expect(photoProblem(new File(['x'], 'a', { type }))).toBe('Use a JPEG or PNG photo.')
    }
    const big = new File([new Uint8Array(25 * 1024 * 1024 + 1)], 'big.jpg', { type: 'image/jpeg' })
    expect(photoProblem(big)).toMatch(/too big/)
  })

  it('sends the file as it is where the browser cannot shrink it (the server shrinks it then)', async () => {
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    expect(await shrinkPhoto(file)).toBe(file)
  })
})
