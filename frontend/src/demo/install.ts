import { DemoBackend, type DemoState } from './backend'

/** Where the demo keeps its data: this browser only. */
export const STORAGE_KEY = 'kadkerja-browser-demo-v1'

function load(storage: Storage): DemoBackend {
  const saved = storage.getItem(STORAGE_KEY)
  if (saved) {
    try {
      const state = JSON.parse(saved) as DemoState
      // An older or damaged save is not patched up: the demo starts again from the seed.
      if (state?.version === 2 && [state.staff, state.jobs, state.vehicles, state.customers].every(Array.isArray)) {
        return new DemoBackend(state)
      }
    } catch {
      // Unreadable: start again below.
    }
  }
  const fresh = DemoBackend.seeded()
  storage.setItem(STORAGE_KEY, JSON.stringify(fresh.state))
  return fresh
}

/**
 * Sends the app's /api requests to the in-browser backend instead of the network. State is read
 * from localStorage on every request, so a customer link opened in another tab sees the same data.
 */
export function installDemo(storage: Storage = window.localStorage): void {
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname + input.search : input.url
    const path = url.startsWith('http') ? new URL(url).pathname + new URL(url).search : url
    if (!path.startsWith('/api/')) return realFetch(input, init)
    const backend = load(storage)
    const body = typeof init?.body === 'string' && init.body ? JSON.parse(init.body) : undefined
    const res = backend.handle(init?.method ?? 'GET', path, body)
    storage.setItem(STORAGE_KEY, JSON.stringify(backend.state))
    if (res.status === 204) return new Response(null, { status: 204 })
    return new Response(JSON.stringify(res.body), {
      status: res.status,
      headers: { 'Content-Type': res.status < 400 ? 'application/json' : 'application/problem+json' },
    })
  }
}

/** Throws the demo data away; the next request starts a fresh demo workshop. */
export function resetDemo(storage: Storage = window.localStorage): void {
  storage.removeItem(STORAGE_KEY)
}
