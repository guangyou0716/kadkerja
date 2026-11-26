import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router'
import type { Me } from './api'
import { AuthGate, SignOutButton } from './auth'
import { useI18n } from './i18n/context'
import { I18nProvider } from './i18n/I18nProvider'
import { LanguagePicker } from './i18n/LanguagePicker'
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
  const { t } = useI18n()
  const advisor = me.role === 'ADVISOR'
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-teal-700">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <span className="text-lg font-bold text-white">kadkerja</span>
          <nav aria-label={t('nav.main')} className="flex flex-wrap gap-1">
            <NavLink to="/" end className={nav}>
              {t('nav.board')}
            </NavLink>
            {advisor ? (
              <>
                <NavLink to="/check-in" className={nav}>
                  {t('nav.checkIn')}
                </NavLink>
                <NavLink to="/staff" className={nav}>
                  {t('nav.staff')}
                </NavLink>
              </>
            ) : (
              <NavLink to="/my-jobs" className={nav}>
                {t('nav.myJobs')}
              </NavLink>
            )}
            <NavLink to="/parts" className={nav}>
              {t('nav.parts')}
            </NavLink>
          </nav>
          <div className="flex flex-wrap items-center gap-x-2 text-sm text-teal-50">
            <span>
              {me.name} · {t(advisor ? 'role.ADVISOR' : 'role.TECHNICIAN')}
            </span>
            <NavLink to="/account" className={nav}>
              {t('nav.password')}
            </NavLink>
            <SignOutButton />
            <LanguagePicker tone="dark" />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Routes>
          <Route path="/" element={<Board />} />
          <Route
            path="/check-in"
            element={advisor ? <CheckInPage /> : <p className="text-slate-800">{t('app.onlyAdvisorChecksIn')}</p>}
          />
          <Route path="/my-jobs" element={<MyJobs />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/parts" element={<PartsPage />} />
          <Route
            path="/staff"
            element={advisor ? <StaffPage /> : <p className="text-slate-800">{t('app.onlyAdvisorStaff')}</p>}
          />
          <Route path="/jobs/:id" element={<JobPage />} />
          <Route path="*" element={<p className="text-slate-800">{t('app.notFound')}</p>} />
        </Routes>
      </main>
    </div>
  )
}

/**
 * The customer's page has no staff header or navigation; everything else is the staff app. [banner] (the browser
 * demo's notice) sits above both, inside the language provider.
 */
export function AppRoutes({ banner = null }: { banner?: ReactNode }) {
  // ?lang= is read once, on the page the app opened on (the customer's link carries it).
  const { search } = useLocation()
  return (
    <I18nProvider search={search}>
      {banner}
      <Routes>
        <Route path="/t/:token" element={<CustomerPage />} />
        <Route path="/*" element={<Layout />} />
      </Routes>
    </I18nProvider>
  )
}

const client = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000 } } })

export default function App({ banner = null }: { banner?: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <AppRoutes banner={banner} />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
