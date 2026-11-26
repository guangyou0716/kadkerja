import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

async function start() {
  let banner: ReactNode = null
  // Only `npm run build:demo` / `npm run dev:demo` (mode "demo"). In every other build this is
  // `if (false)`, so the bundler drops the branch and the demo code is not in the output at all.
  if (import.meta.env.MODE === 'demo') {
    const { installDemo } = await import('./demo/install')
    const { DemoBanner } = await import('./demo/DemoBanner')
    installDemo()
    banner = <DemoBanner />
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {banner}
      <App />
    </StrictMode>,
  )
}

void start()
