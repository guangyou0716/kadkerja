import { useI18n } from './context'
import { isLang, LANG_NAME, LANG_TAG, LANGS } from './core'

/** The language picker: a plain select, each language written in itself. */
export function LanguagePicker({ className = '', tone = 'light' }: { className?: string; tone?: 'light' | 'dark' }) {
  const { lang, setLang, t } = useI18n()
  const colours =
    tone === 'dark'
      ? 'border-teal-500 bg-teal-800 text-white focus-visible:outline-white'
      : 'border-slate-300 bg-white text-slate-900 focus-visible:outline-teal-700'
  return (
    <select
      aria-label={t('lang.label')}
      value={lang}
      onChange={(e) => isLang(e.target.value) && setLang(e.target.value)}
      className={`rounded-md border px-2 py-1.5 text-sm focus-visible:outline-2 ${colours} ${className}`}
    >
      {LANGS.map((l) => (
        <option key={l} value={l} lang={LANG_TAG[l]}>
          {LANG_NAME[l]}
        </option>
      ))}
    </select>
  )
}
