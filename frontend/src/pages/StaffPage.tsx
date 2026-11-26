import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api, ApiError, type Role, type StaffMember } from '../api'
import { buttonClass, ErrorNote, Field, inputClass, secondaryButtonClass } from '../components'
import { useMe } from '../session'

const ROLE_LABEL: Record<Role, string> = { ADVISOR: 'Service advisor', TECHNICIAN: 'Technician' }

/** The service advisor's staff list: add people, deactivate or reactivate them, set a new password. */
export function StaffPage() {
  const staff = useQuery({ queryKey: ['staff'], queryFn: api.staff })
  return (
    <section aria-labelledby="staff-title" className="flex max-w-4xl flex-col gap-4">
      <div>
        <h1 id="staff-title" className="text-2xl font-bold text-slate-900">
          Staff
        </h1>
        <p className="text-sm text-slate-700">
          People are never deleted, so their name stays on old jobs. A deactivated account cannot sign in, is signed out
          at once, and its open jobs go back to nobody.
        </p>
      </div>
      {staff.isPending ? (
        <p className="text-slate-700">Loading staff…</p>
      ) : staff.isError ? (
        <ErrorNote>{staff.error.message}</ErrorNote>
      ) : (
        <StaffTable staff={staff.data} />
      )}
      <AddStaff />
    </section>
  )
}

function StaffTable({ staff }: { staff: StaffMember[] }) {
  const me = useMe()
  const client = useQueryClient()
  const [passwordFor, setPasswordFor] = useState<number | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const toggle = useMutation({
    mutationFn: (s: StaffMember) => (s.active ? api.deactivateStaff(s.id) : api.activateStaff(s.id)),
    onSuccess: (s) => {
      setDone(s.active ? `${s.name} can sign in again.` : `${s.name} is deactivated and signed out.`)
      void client.invalidateQueries({ queryKey: ['staff'] })
      // Their open jobs may have gone back to nobody.
      void client.invalidateQueries({ queryKey: ['jobs'] })
      void client.invalidateQueries({ queryKey: ['job'] })
    },
  })
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      {toggle.isError && <ErrorNote>{toggle.error.message}</ErrorNote>}
      {done && (
        <p role="status" className="mb-2 text-sm text-teal-900">
          {done}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-700">
              <th className="py-1 pr-3 font-medium">Name</th>
              <th className="py-1 pr-3 font-medium">Username</th>
              <th className="py-1 pr-3 font-medium">Role</th>
              <th className="py-1 pr-3 font-medium">Status</th>
              <th className="py-1 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <StaffRow
                key={s.id}
                s={s}
                self={s.username === me.username}
                busy={toggle.isPending}
                onToggle={() => {
                  if (!s.active || window.confirm(`Deactivate ${s.name}? They are signed out at once and cannot sign in.`)) {
                    setDone(null)
                    toggle.mutate(s)
                  }
                }}
                settingPassword={passwordFor === s.id}
                onPassword={(open) => {
                  setDone(null)
                  setPasswordFor(open ? s.id : null)
                }}
                onPasswordSet={() => {
                  setPasswordFor(null)
                  setDone(`New password set for ${s.name}. Their other sessions are signed out.`)
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StaffRow(props: {
  s: StaffMember
  self: boolean
  busy: boolean
  onToggle: () => void
  settingPassword: boolean
  onPassword: (open: boolean) => void
  onPasswordSet: () => void
}) {
  const { s, self } = props
  return (
    <>
      <tr className="border-b border-slate-100 align-middle">
        <td className="py-2 pr-3 text-slate-900">
          {s.name}
          {self && <span className="ml-1 text-slate-600">(you)</span>}
        </td>
        <td className="py-2 pr-3 font-mono text-slate-800">{s.username}</td>
        <td className="py-2 pr-3 text-slate-800">{ROLE_LABEL[s.role]}</td>
        <td className="py-2 pr-3">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.active ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-200 text-slate-800'}`}
          >
            {s.active ? 'Active' : 'Deactivated'}
          </span>
        </td>
        <td className="py-2 text-right whitespace-nowrap">
          {self ? (
            <span className="text-xs text-slate-600">Use “My password” above</span>
          ) : (
            <span className="inline-flex gap-2">
              <button
                type="button"
                className={secondaryButtonClass}
                aria-label={`Set password for ${s.name}`}
                aria-expanded={props.settingPassword}
                onClick={() => props.onPassword(!props.settingPassword)}
              >
                Set password
              </button>
              <button
                type="button"
                className={secondaryButtonClass}
                aria-label={`${s.active ? 'Deactivate' : 'Reactivate'} ${s.name}`}
                disabled={props.busy}
                onClick={props.onToggle}
              >
                {s.active ? 'Deactivate' : 'Reactivate'}
              </button>
            </span>
          )}
        </td>
      </tr>
      {props.settingPassword && (
        <tr>
          <td colSpan={5} className="bg-slate-50 p-3">
            <SetPassword s={s} onCancel={() => props.onPassword(false)} onDone={props.onPasswordSet} />
          </td>
        </tr>
      )}
    </>
  )
}

function SetPassword({ s, onCancel, onDone }: { s: StaffMember; onCancel: () => void; onDone: () => void }) {
  const [error, setError] = useState<string | undefined>()
  const save = useMutation({
    mutationFn: (password: string) => api.setStaffPassword(s.id, password),
    onSuccess: onDone,
    onError: (e) => setError(e instanceof ApiError ? (e.fields.password ?? e.message) : e.message),
  })
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(undefined)
    save.mutate(String(new FormData(e.currentTarget).get('password') ?? ''))
  }
  return (
    <form onSubmit={submit} noValidate aria-label={`Set a password for ${s.name}`} className="flex flex-wrap items-end gap-2">
      <div className="min-w-64 flex-1">
        <Field label={`New password for ${s.name}`} error={error} hint="At least 12 characters. Tell them in person; they can change it under My password.">
          {(p) => <input {...p} name="password" type="password" autoComplete="new-password" className={`${inputClass} w-full`} />}
        </Field>
      </div>
      <button type="submit" className={buttonClass} disabled={save.isPending}>
        Save password
      </button>
      <button type="button" className={secondaryButtonClass} onClick={onCancel}>
        Cancel
      </button>
    </form>
  )
}

function AddStaff() {
  const client = useQueryClient()
  const [fields, setFields] = useState<Record<string, string>>({})
  const [added, setAdded] = useState<string | null>(null)
  const add = useMutation({
    mutationFn: api.addStaff,
    onSuccess: (s) => {
      setAdded(`${s.name} can now sign in as ${s.username}.`)
      void client.invalidateQueries({ queryKey: ['staff'] })
    },
    onError: (e) => setFields(e instanceof ApiError ? e.fields : {}),
  })
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    setFields({})
    setAdded(null)
    add.mutate(
      {
        name: String(f.get('name') ?? ''),
        username: String(f.get('username') ?? ''),
        role: f.get('role') as Role,
        password: String(f.get('password') ?? ''),
      },
      { onSuccess: () => form.reset() },
    )
  }
  return (
    <form onSubmit={submit} noValidate aria-labelledby="add-staff-title" className="flex flex-col gap-4 rounded-lg bg-white p-4 shadow-sm">
      <h2 id="add-staff-title" className="font-semibold text-slate-900">
        Add a member of staff
      </h2>
      {add.isError && Object.keys(fields).length === 0 && <ErrorNote>{add.error.message}</ErrorNote>}
      {added && (
        <p role="status" className="text-sm text-teal-900">
          {added}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" error={fields.name}>
          {(p) => <input {...p} name="name" autoComplete="off" className={inputClass} />}
        </Field>
        <Field label="Username" error={fields.username} hint="3-40 letters, digits, dots, dashes or underscores">
          {(p) => <input {...p} name="username" autoComplete="off" autoCapitalize="none" className={`${inputClass} font-mono`} />}
        </Field>
        <Field label="Role" error={fields.role}>
          {(p) => (
            <select {...p} name="role" defaultValue="TECHNICIAN" className={inputClass}>
              <option value="TECHNICIAN">Technician</option>
              <option value="ADVISOR">Service advisor</option>
            </select>
          )}
        </Field>
        <Field label="First password" error={fields.password} hint="At least 12 characters; they can change it under My password">
          {(p) => <input {...p} name="password" type="password" autoComplete="new-password" className={inputClass} />}
        </Field>
      </div>
      <div>
        <button type="submit" className={buttonClass} disabled={add.isPending}>
          {add.isPending ? 'Adding…' : 'Add'}
        </button>
      </div>
    </form>
  )
}
