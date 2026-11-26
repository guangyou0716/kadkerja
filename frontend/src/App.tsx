import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, NavLink, Route, Routes } from 'react-router'
import { Board } from './pages/Board'
import { CheckInPage } from './pages/CheckInPage'
import { JobPage } from './pages/JobPage'

const nav = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-semibold ${isActive ? 'bg-teal-800 text-white' : 'text-teal-50 hover:bg-teal-800'}`

export function Layout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-teal-700">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <span className="text-lg font-bold text-white">kadkerja</span>
          <nav aria-label="Main" className="flex gap-1">
            <NavLink to="/" end className={nav}>
              Job board
            </NavLink>
            <NavLink to="/check-in" className={nav}>
              Check in a car
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Routes>
          <Route path="/" element={<Board />} />
          <Route path="/check-in" element={<CheckInPage />} />
          <Route path="/jobs/:id" element={<JobPage />} />
          <Route path="*" element={<p className="text-slate-800">Page not found.</p>} />
        </Routes>
      </main>
    </div>
  )
}

const client = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000 } } })

export default function App() {
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
