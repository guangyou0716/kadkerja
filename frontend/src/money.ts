/** "RM 1,234.50" from whole sen. */
export function formatRm(sen: number): string {
  const sign = sen < 0 ? '-' : ''
  const abs = Math.abs(sen)
  const ringgit = Math.floor(abs / 100).toLocaleString('en-MY')
  return `${sign}RM ${ringgit}.${String(abs % 100).padStart(2, '0')}`
}

/**
 * Whole sen from what someone typed for a price: "12", "12.5", "12.50", "1,200.00", "RM 8".
 * Null when it is not a plain non-negative amount with at most 2 decimals.
 */
export function parseRm(text: string): number | null {
  const t = text.trim().replace(/^RM\s*/i, '').replace(/,(?=\d{3}(\D|$))/g, '')
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(t)
  if (!m) return null
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
}
