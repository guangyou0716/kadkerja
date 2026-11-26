import { createContext, createElement, Fragment, useContext, type ReactNode } from 'react'
import type { Args, Lang, MessageKey } from './core'

export interface I18n {
  lang: Lang
  setLang: (lang: Lang) => void
  t: (key: MessageKey, args?: Args) => string
  /** A message with React elements in its placeholders (e.g. <code>). */
  rich: (key: MessageKey, parts: Record<string, ReactNode>) => ReactNode
  /** Date and time in Malaysia, e.g. "27 Nov, 06:07" / "11月27日 06:07". */
  when: (iso: string) => string
  number: (n: number) => string
}

export const I18nContext = createContext<I18n | null>(null)

export function useI18n(): I18n {
  const i18n = useContext(I18nContext)
  if (!i18n) throw new Error('useI18n outside I18nProvider')
  return i18n
}

/** "{name}" in [template] -> parts.name, which may be a React element (e.g. <code>). */
export function fillParts(template: string, parts: Record<string, ReactNode>): ReactNode {
  return template.split(/(\{\w+\})/).map((piece, i) => {
    const name = /^\{(\w+)\}$/.exec(piece)?.[1]
    return createElement(Fragment, { key: i }, name !== undefined && name in parts ? parts[name] : piece)
  })
}
