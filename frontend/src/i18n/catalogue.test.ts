import { describe, expect, it } from 'vitest'
import { CATALOGUES, LANGS, format, translate } from './core'
import { en, type MessageKey } from './en'

const keys = Object.keys(en) as MessageKey[]
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

// Every source file of the app except the catalogues and the tests, as text.
const sources = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}', '!./*.ts', '!../test/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('message catalogues', () => {
  it.each(LANGS)('%s has every English key, each with text, and nothing else', (lang) => {
    const cat = CATALOGUES[lang]
    expect(Object.keys(cat).sort()).toEqual([...keys].sort())
    for (const k of keys) expect(cat[k].trim(), `${lang} ${k}`).not.toBe('')
  })

  it.each(LANGS.filter((l) => l !== 'en'))('%s uses the same {placeholders} as English in every message', (lang) => {
    for (const k of keys) expect(placeholders(CATALOGUES[lang][k]), `${lang} ${k}`).toEqual(placeholders(en[k]))
  })

  it('has no key the app never uses (literal keys, or a `prefix.${x}` template for status / stage maps)', () => {
    const code = Object.values(sources).join('\n')
    expect(Object.keys(sources).length).toBeGreaterThan(20)
    const prefixes = [...code.matchAll(/`([a-z]+(?:\.[A-Za-z]+)*\.)\$\{/g)].map((m) => m[1])
    const unused = keys.filter((k) => !code.includes(`'${k}'`) && !prefixes.some((p) => k.startsWith(p)))
    expect(unused).toEqual([])
  })

  it('Malay and Chinese are really translated (not English copied over), apart from names and units', () => {
    const same = (lang: 'ms' | 'zh') => keys.filter((k) => CATALOGUES[lang][k] === en[k] && /[a-z]{3}/.test(en[k].replace(/\{\w+\}/g, '')))
    // Words that are the same in Malay ("Model", "Status") or are codes / formats.
    expect(same('ms')).toEqual(['checkIn.model', 'staff.status'])
    expect(same('zh')).toEqual([])
  })

  it('fills placeholders and leaves a missing one visible', () => {
    expect(format('Hi {name}, {n} cars', { name: 'Aina', n: 2 })).toBe('Hi Aina, 2 cars')
    expect(format('Hi {name}', {})).toBe('Hi {name}')
    expect(format('no placeholders')).toBe('no placeholders')
    expect(translate('ms', 'board.counts', { open: 3, done: 1 })).toBe('3 terbuka · 1 sudah diambil atau dibatalkan')
    expect(translate('zh', 'quote.titleVersion', { version: 2 })).toBe('报价（第 2 版）')
  })
})
