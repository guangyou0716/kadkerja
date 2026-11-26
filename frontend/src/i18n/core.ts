import { en, type MessageKey } from './en'
import { ms } from './ms'
import { zh } from './zh'

export type { MessageKey } from './en'

export const LANGS = ['en', 'ms', 'zh'] as const
export type Lang = (typeof LANGS)[number]

/** Each language named in itself, so anyone can find their own. */
export const LANG_NAME: Record<Lang, string> = { en: 'English', ms: 'Bahasa Melayu', zh: '简体中文' }
/** For the <html lang> attribute and screen readers. */
export const LANG_TAG: Record<Lang, string> = { en: 'en', ms: 'ms', zh: 'zh-Hans' }
/** Dates and numbers: Malaysian conventions in English and Malay, mainland Simplified Chinese otherwise. */
export const LOCALE: Record<Lang, string> = { en: 'en-MY', ms: 'ms-MY', zh: 'zh-CN' }

export const CATALOGUES: Record<Lang, Record<MessageKey, string>> = { en, ms, zh }

/** Where the chosen language is kept (this browser only). */
export const LANG_STORAGE_KEY = 'kadkerja.lang'

export type Args = Record<string, string | number>

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v)

/** "{name}" -> args.name. A missing argument stays visible as "{name}" rather than becoming "undefined". */
export function format(template: string, args?: Args): string {
  if (!args) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in args ? String(args[name]) : whole))
}

/** One message in one language; a key missing from a catalogue (an old build, say) falls back to English. */
export function translate(lang: Lang, key: MessageKey, args?: Args): string {
  return format(CATALOGUES[lang][key] ?? en[key] ?? key, args)
}

/** The device's first language we have: "ms-MY" -> ms, any Chinese -> zh (the only Chinese we have). */
export function deviceLang(languages: readonly string[] | undefined): Lang {
  for (const l of languages ?? []) {
    const base = String(l).toLowerCase().split(/[-_]/)[0]
    if (base === 'en' || base === 'ms' || base === 'zh') return base
    if (base === 'id') return 'ms' // close enough to read, better than English for most
  }
  return 'en'
}

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null // blocked (private mode, sandboxed frame): just do not remember
  }
}

/** The language to start with: ?lang= on the link, then the saved choice, then the device, then English. */
export function startLang(search: string, languages: readonly string[] | undefined): Lang {
  const fromLink = new URLSearchParams(search).get('lang')
  if (isLang(fromLink)) return fromLink
  let saved: string | null = null
  try {
    saved = storage()?.getItem(LANG_STORAGE_KEY) ?? null
  } catch {
    saved = null
  }
  // Anything else saved there (an old value, someone's typing in devtools) is ignored, not trusted.
  if (isLang(saved)) return saved
  return deviceLang(languages)
}

export function saveLang(lang: Lang) {
  try {
    storage()?.setItem(LANG_STORAGE_KEY, lang)
  } catch {
    // Full or blocked: the choice still holds until the page is closed.
  }
}

