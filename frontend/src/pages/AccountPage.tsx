import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api, ApiError } from '../api'
import { buttonClass, ErrorNote, Field, inputClass } from '../components'
import { useMe } from '../session'

/** Change my own password. Other devices signed in as me are signed out; this one stays. */
export function AccountPage() {
  const me = useMe()
  const [fields, setFields] = useState<Record<string, string>>({})
  const [changed, setChanged] = useState(false)
  const change = useMutation({
    mutationFn: ({ current, next }: { current: string; next: string }) => api.changePassword(current, next),
    onError: (e) => setFields(e instanceof ApiError ? e.fields : {}),
  })
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const current = String(f.get('currentPassword') ?? '')
    const next = String(f.get('newPassword') ?? '')
    setChanged(false)
    change.reset()
    if (next !== String(f.get('repeat') ?? '')) {
      setFields({ repeat: 'the two new passwords are not the same' })
      return
    }
    setFields({})
    change.mutate(
      { current, next },
      {
        onSuccess: () => {
          form.reset()
          setChanged(true)
        },
      },
    )
  }
  return (
    <section aria-labelledby="account-title" className="max-w-md">
      <h1 id="account-title" className="mb-1 text-2xl font-bold text-slate-900">
        My password
      </h1>
      <p className="mb-4 text-sm text-slate-700">
        Signed in as <span className="font-mono">{me.username}</span>. After a change, other devices signed in as you are
        signed out.
      </p>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-lg bg-white p-4 shadow-sm">
        {change.isError && Object.keys(fields).length === 0 && <ErrorNote>{change.error.message}</ErrorNote>}
        {changed && (
          <p role="status" className="text-sm text-teal-900">
            Password changed. Other devices are signed out.
          </p>
        )}
        <Field label="Current password" error={fields.currentPassword}>
          {(p) => <input {...p} name="currentPassword" type="password" autoComplete="current-password" className={inputClass} />}
        </Field>
        <Field label="New password" error={fields.newPassword} hint="At least 12 characters">
          {(p) => <input {...p} name="newPassword" type="password" autoComplete="new-password" className={inputClass} />}
        </Field>
        <Field label="New password again" error={fields.repeat}>
          {(p) => <input {...p} name="repeat" type="password" autoComplete="new-password" className={inputClass} />}
        </Field>
        <div>
          <button type="submit" className={buttonClass} disabled={change.isPending}>
            {change.isPending ? 'Saving…' : 'Change password'}
          </button>
        </div>
      </form>
    </section>
  )
}
