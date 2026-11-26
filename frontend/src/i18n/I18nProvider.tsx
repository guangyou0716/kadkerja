import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { CATALOGUES, LANG_TAG, LOCALE, saveLang, startLang, translate, type Lang } from './core'
import { en } from './en'
import { fillParts, I18nContext, type I18n } from './context'

/** Gives the whole app its language; the choice is remembered in this browser. */
export function I18nProvider({ children, search = '' }: { children: ReactNode; search?: string }) {
  const [lang, setLangState] = useState<Lang>(() => startLang(search, typeof navigator === 'undefined' ? undefined : navigator.languages))
  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    saveLang(l)
  }, [])
  useEffect(() => {
    document.documentElement.lang = LANG_TAG[lang]
  }, [lang])
  const value = useMemo<I18n>(() => {
    const dates = new Intl.DateTimeFormat(LOCALE[lang], {
      timeZone: 'Asia/Kuala_Lumpur',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const numbers = new Intl.NumberFormat(LOCALE[lang])
    return {
      lang,
      setLang,
      t: (key, args) => translate(lang, key, args),
      rich: (key, parts) => fillParts(CATALOGUES[lang][key] ?? en[key], parts),
      when: (iso) => dates.format(new Date(iso)),
      number: (n) => numbers.format(n),
    }
  }, [lang, setLang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

