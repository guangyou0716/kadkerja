import { resetDemo } from './install'

/** Always on screen in the browser demo, so nobody mistakes it for a real workshop system. */
export function DemoBanner() {
  const reset = () => {
    if (!window.confirm('Reset the demo? Your changes in this browser are deleted and the sample cars come back.')) return
    resetDemo()
    window.location.assign('/')
  }
  return (
    <div role="region" aria-label="Demo notice" className="bg-amber-100 text-amber-950">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
        <p>
          <strong>Browser-only demo.</strong> No real server is used: data stays in this browser on this device. Sign in
          as <code>advisor</code> (service advisor) or <code>tech</code> (technician), password <code>demo-kadkerja</code>.
          All names and numbers are made up.
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-amber-800 px-3 py-1 font-semibold hover:bg-amber-200"
        >
          Reset demo
        </button>
      </div>
    </div>
  )
}
