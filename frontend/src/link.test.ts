import { describe, expect, it } from 'vitest'
import { customerLink, whatsappText, whatsappUrl } from './link'
import { job } from './test/render'

describe('customer link messages', () => {
  const link = customerLink('https://kadkerja.example', 'TestTokenTestTokenTest01')

  it('builds the link from the origin and token', () => {
    expect(link).toBe('https://kadkerja.example/t/TestTokenTestTokenTest01')
  })

  it('asks for an answer when the quote is out, with the total', () => {
    const text = whatsappText(job({ status: 'QUOTED' }), link)
    expect(text).toContain('Hi Test,')
    expect(text).toContain('PKR 1234 (KK-2026-0007)')
    expect(text).toContain('RM 203.58 incl. SST')
    expect(text).toContain('Approve or Decline')
    expect(text.endsWith(link)).toBe(true)
  })

  it('says ready to collect, or just progress otherwise', () => {
    expect(whatsappText(job({ status: 'READY' }), link)).toContain('ready to collect')
    expect(whatsappText(job({ status: 'INSPECTING' }), link)).toContain('follow the progress')
  })

  it('turns a Malaysian number into the wa.me format and encodes the text', () => {
    expect(whatsappUrl('012-000 0001', 'a b&c')).toBe('https://wa.me/60120000001?text=a%20b%26c')
    expect(whatsappUrl('+60 12-0000001', 'x')).toBe('https://wa.me/60120000001?text=x')
  })
})
