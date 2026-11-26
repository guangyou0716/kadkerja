import { dataUrlBytes, DemoBackend, type DemoState } from './backend'

/** Where the demo keeps its data: this browser only. */
export const STORAGE_KEY = 'kadkerja-browser-demo-v1'

function load(storage: Storage): DemoBackend {
  const saved = storage.getItem(STORAGE_KEY)
  if (saved) {
    try {
      const state = JSON.parse(saved) as DemoState
      // An older or damaged save is not patched up: the demo starts again from the seed.
      if (state?.version === 5 && [state.staff, state.jobs, state.vehicles, state.customers, state.parts, state.movements, state.photos].every(Array.isArray)) {
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
    const body =
      init?.body instanceof FormData
        ? await formBody(init.body)
        : typeof init?.body === 'string' && init.body
          ? JSON.parse(init.body)
          : undefined
    const res = backend.handle(init?.method ?? 'GET', path, body)
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(backend.state))
    } catch {
      // Browser storage full: nothing was saved, so the change did not happen.
      return problem(413, 'Some fields need fixing.', { file: "the browser's storage for this demo is full; remove a photo or reset the demo" })
    }
    if (res.image) {
      const bytes = dataUrlBytes(res.image) ?? new Uint8Array()
      return new Response(bytes, { status: 200, headers: { 'Content-Type': res.image.slice(5, res.image.indexOf(';')) } })
    }
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

function problem(status: number, detail: string, fields: Record<string, string>): Response {
  return new Response(JSON.stringify({ detail, fields }), { status, headers: { 'Content-Type': 'application/problem+json' } })
}

/** A photo upload as the demo backend reads it: the file becomes a data: URL. */
async function formBody(form: FormData): Promise<Record<string, unknown>> {
  const file = form.get('file')
  return {
    stage: form.get('stage'),
    caption: form.get('caption') ?? undefined,
    dataUrl: file instanceof Blob && file.size > 0 ? await toDataUrl(file) : '',
  }
}

async function toDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let raw = ''
  for (let i = 0; i < bytes.length; i += 0x8000) raw += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(raw)}`
}
