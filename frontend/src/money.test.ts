import { describe, expect, it } from 'vitest'
import { formatRm, parseRm } from './money'

describe('formatRm', () => {
  it('writes ringgit with thousands and two decimals', () => {
    expect(formatRm(0)).toBe('RM 0.00')
    expect(formatRm(5)).toBe('RM 0.05')
    expect(formatRm(123450)).toBe('RM 1,234.50')
    expect(formatRm(-250)).toBe('-RM 2.50')
  })
})

describe('parseRm', () => {
  it('reads what people type', () => {
    expect(parseRm('12')).toBe(1200)
    expect(parseRm('12.5')).toBe(1250)
    expect(parseRm('12.50')).toBe(1250)
    expect(parseRm(' RM 8 ')).toBe(800)
    expect(parseRm('rm45.05')).toBe(4505)
    expect(parseRm('1,200.00')).toBe(120000)
    expect(parseRm('0')).toBe(0)
  })

  it('refuses anything that is not a plain amount', () => {
    for (const t of ['', ' ', '-5', '12.505', '1,20', 'abc', '1e3', '12.', '.5', '12,50', '99999999']) {
      expect(parseRm(t), t).toBeNull()
    }
  })

  it('round-trips every sen amount it formats', () => {
    for (let sen = 0; sen < 300000; sen += 997) {
      expect(parseRm(formatRm(sen))).toBe(sen)
    }
  })
})
