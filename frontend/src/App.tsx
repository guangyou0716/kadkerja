import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, NavLink, Route, Routes } from 'react-router'
import type { Me } from './api'
import { AuthGate, SignOutButton } from './auth'
import { AccountPage } from './pages/AccountPage'
import { Board } from './pages/Board'
import { CheckInPage } from './pages/CheckInPage'
import { CustomerPage } from './pages/CustomerPage'
import { JobPage } from './pages/JobPage'
import { MyJobs } from './pages/MyJobs'
import { PartsPage } from './pages/PartsPage'
import { StaffPage } from './pages/StaffPage'

const nav = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold ${isActive ? 'bg-teal-800 text-white' : 'text-teal-50 hover:bg-teal-800'}`

export function Layout() {
  return <AuthGate>{(me) => <StaffApp me={me} />}</AuthGate>
}

function StaffApp({ me }: { me: Me }) {
  const advisor = me.role === 'ADVISOR'
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-teal-700">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <span className="text-lg font-bold text-white">kadkerja</span>
          <nav aria-label="Main" className="flex gap-1">
            <NavLink to="/" end className={nav}>
              Job board
            </NavLink>
            {advisor ? (
              <>
                <NavLink to="/check-in" className={nav}>
                  Check in a car
                </NavLink>
                <NavLink to="/staff" className={nav}>
                  Staff
                </NavLink>
              </>
            ) : (
              <NavLink to="/my-jobs" className={nav}>
                My jobs
              </NavLink>
            )}
            <NavLink to="/parts" className={nav}>
              Parts
            </NavLink>
          </nav>
          <div className="flex flex-wrap items-center gap-x-2 text-sm text-teal-50">
            <span>
              {me.name} · {advisor ? 'Service advisor' : 'Technician'}
            </span>
            <NavLink to="/account" className={nav}>
              My password
            </NavLink>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Routes>
          <Route path="/" element={<Board />} />
          <Route
            path="/check-in"
            element={advisor ? <CheckInPage /> : <p className="text-slate-800">Only the service advisor checks in cars.</p>}
          />
          <Route path="/my-jobs" element={<MyJobs />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/parts" element={<PartsPage />} />
          <Route
            path="/staff"
            element={advisor ? <StaffPage /> : <p className="text-slate-800">Only the service advisor manages staff.</p>}
          />
          <Route path="/jobs/:id" element={<JobPage />} />
          <Route path="*" element={<p className="text-slate-800">Page not found.</p>} />
        </Routes>
      </main>
    </div>
  )
}

/** The customer's page has no staff header or navigation; everything else is the staff app. */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/t/:token" element={<CustomerPage />} />
      <Route path="/*" element={<Layout />} />
    </Routes>
  )
}

const client = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000 } } })

export default function App() {
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
