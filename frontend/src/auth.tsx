import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { api, ApiError, SIGNED_OUT_EVENT, type Me } from './api'
import { buttonClass, ErrorNote, Field, inputClass } from './components'
import { MeContext } from './session'

/** Shows the sign-in form until the server knows who this is. */
export function AuthGate({ children }: { children: (me: Me) => ReactNode }) {
  const client = useQueryClient()
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, retry: false, staleTime: Infinity })
  useEffect(() => {
    const onSignedOut = () => void client.invalidateQueries({ queryKey: ['me'] })
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut)
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut)
  }, [client])
  if (me.isPending) return <p className="p-6 text-slate-700">Loading…</p>
  if (me.isError) {
    if (me.error instanceof ApiError && me.error.status === 401) return <SignIn />
    return <ErrorNote>{me.error.message}</ErrorNote>
  }
  return <MeContext.Provider value={me.data}>{children(me.data)}</MeContext.Provider>
}

function SignIn() {
  const client = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const login = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) => api.login(username, password),
    onSuccess: (me) => {
      client.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
      client.setQueryData(['me'], me)
    },
    onError: (e) => setError(e.message),
  })
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setError(null)
    login.mutate({ username: String(f.get('username') ?? ''), password: String(f.get('password') ?? '') })
  }
  return (
    <main className="flex min-h-screen items-start justify-center bg-slate-100 px-4 pt-20">
      <form onSubmit={submit} aria-labelledby="signin-title" className="flex w-full max-w-sm flex-col gap-4 rounded-lg bg-white p-6 shadow-sm">
        <div>
          <p className="text-sm font-semibold text-teal-800">kadkerja</p>
          <h1 id="signin-title" className="text-xl font-bold text-slate-900">
            Staff sign-in
          </h1>
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Field label="Username">
          {(p) => <input {...p} name="username" autoComplete="username" required className={inputClass} />}
        </Field>
        <Field label="Password">
          {(p) => <input {...p} name="password" type="password" autoComplete="current-password" required className={inputClass} />}
        </Field>
        <button type="submit" className={buttonClass} disabled={login.isPending}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}

export function SignOutButton() {
  const client = useQueryClient()
  const logout = useMutation({
    mutationFn: api.logout,
    // Drop everything cached for this person, then ask the server again: it answers 401 and the
    // sign-in form shows. (clear() alone would leave the page showing the old user.)
    onSettled: () => {
      client.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
      void client.resetQueries({ queryKey: ['me'] })
    },
  })
  return (
    <button
      type="button"
      onClick={() => logout.mutate()}
      className="rounded-md px-3 py-2 text-sm font-semibold text-teal-50 hover:bg-teal-800"
    >
      Sign out
    </button>
  )
}
