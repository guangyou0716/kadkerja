import { fillParts, useI18n } from '../i18n/context'
import { resetDemo } from './install'
import { DEMO_MESSAGES } from './messages'

/** Always on screen in the browser demo, so nobody mistakes it for a real workshop system. */
export function DemoBanner() {
  const { lang } = useI18n()
  const m = DEMO_MESSAGES[lang]
  const reset = () => {
    if (!window.confirm(m.resetConfirm)) return
    resetDemo()
    window.location.assign('/')
  }
  return (
    <div role="region" aria-label={m.notice} className="bg-amber-100 text-amber-950">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
        <p>
          <strong>{m.title}</strong>{' '}
          {fillParts(m.text, { advisor: <code>advisor</code>, tech: <code>tech</code>, password: <code>demo-kadkerja</code> })}
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-amber-800 px-3 py-1 font-semibold hover:bg-amber-200"
        >
          {m.reset}
        </button>
      </div>
    </div>
  )
}
