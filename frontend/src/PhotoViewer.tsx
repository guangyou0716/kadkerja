import { useEffect, useRef, type ReactNode } from 'react'
import { PhotoImage } from './PhotoImage'
import { secondaryButtonClass } from './components'
import { useI18n } from './i18n/context'

/** One photo large, over the page. Escape or Close returns to where you were. */
export function PhotoViewer({
  url,
  title,
  caption,
  onClose,
  children,
}: {
  url: string
  title: string
  caption: string | null
  onClose: () => void
  children?: ReactNode
}) {
  const { t } = useI18n()
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    close.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      before?.focus()
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-full w-full max-w-3xl flex-col gap-3 rounded-lg bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button ref={close} type="button" className={secondaryButtonClass} onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
        <PhotoImage url={url} alt={caption ?? title} className="max-h-[70vh] w-full rounded object-contain" />
        {caption && <p className="text-sm text-slate-800">{caption}</p>}
        {children}
      </div>
    </div>
  )
}
