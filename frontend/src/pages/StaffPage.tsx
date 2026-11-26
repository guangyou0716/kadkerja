import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api, ApiError, type Role, type StaffMember } from '../api'
import { buttonClass, ErrorNote, Field, inputClass, secondaryButtonClass } from '../components'
import { errorText } from '../errors'
import { useI18n } from '../i18n/context'
import type { MessageKey } from '../i18n/core'
import { useMe } from '../session'

const ROLE_KEY: Record<Role, MessageKey> = { ADVISOR: 'role.ADVISOR', TECHNICIAN: 'role.TECHNICIAN' }

/** The service advisor's staff list: add people, deactivate or reactivate them, set a new password. */
export function StaffPage() {
  const { t } = useI18n()
  const staff = useQuery({ queryKey: ['staff'], queryFn: api.staff })
  return (
    <section aria-labelledby="staff-title" className="flex max-w-4xl flex-col gap-4">
      <div>
        <h1 id="staff-title" className="text-2xl font-bold text-slate-900">
          {t('staff.title')}
        </h1>
        <p className="text-sm text-slate-700">
          {t('staff.intro')}
        </p>
      </div>
      {staff.isPending ? (
        <p className="text-slate-700">{t('staff.loading')}</p>
      ) : staff.isError ? (
        <ErrorNote>{errorText(staff.error, t)}</ErrorNote>
      ) : (
        <StaffTable staff={staff.data} />
      )}
      <AddStaff />
    </section>
  )
}

function StaffTable({ staff }: { staff: StaffMember[] }) {
  const { t } = useI18n()
  const me = useMe()
  const client = useQueryClient()
  const [passwordFor, setPasswordFor] = useState<number | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const toggle = useMutation({
    mutationFn: (s: StaffMember) => (s.active ? api.deactivateStaff(s.id) : api.activateStaff(s.id)),
    onSuccess: (s) => {
      setDone(t(s.active ? 'staff.reactivated' : 'staff.deactivatedDone', { name: s.name }))
      void client.invalidateQueries({ queryKey: ['staff'] })
      // Their open jobs may have gone back to nobody.
      void client.invalidateQueries({ queryKey: ['jobs'] })
      void client.invalidateQueries({ queryKey: ['job'] })
    },
  })
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      {toggle.isError && <ErrorNote>{errorText(toggle.error, t)}</ErrorNote>}
      {done && (
        <p role="status" className="mb-2 text-sm text-teal-900">
          {done}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-700">
              <th className="py-1 pr-3 font-medium">{t('staff.name')}</th>
              <th className="py-1 pr-3 font-medium">{t('staff.username')}</th>
              <th className="py-1 pr-3 font-medium">{t('staff.role')}</th>
              <th className="py-1 pr-3 font-medium">{t('staff.status')}</th>
              <th className="py-1 font-medium">
                <span className="sr-only">{t('staff.actions')}</span>
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
                  if (!s.active || window.confirm(t('staff.deactivateConfirm', { name: s.name }))) {
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
                  setDone(t('staff.passwordSet', { name: s.name }))
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
  const { t } = useI18n()
  const { s, self } = props
  return (
    <>
      <tr className="border-b border-slate-100 align-middle">
        <td className="py-2 pr-3 text-slate-900">
          {s.name}
          {self && <span className="ml-1 text-slate-600">{t('common.you')}</span>}
        </td>
        <td className="py-2 pr-3 font-mono text-slate-800">{s.username}</td>
        <td className="py-2 pr-3 text-slate-800">{t(ROLE_KEY[s.role])}</td>
        <td className="py-2 pr-3">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.active ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-200 text-slate-800'}`}
          >
            {t(s.active ? 'staff.active' : 'staff.deactivated')}
          </span>
        </td>
        <td className="py-2 text-right whitespace-nowrap">
          {self ? (
            <span className="text-xs text-slate-600">{t('staff.useMyPassword')}</span>
          ) : (
            <span className="inline-flex gap-2">
              <button
                type="button"
                className={secondaryButtonClass}
                aria-label={t('staff.setPasswordFor', { name: s.name })}
                aria-expanded={props.settingPassword}
                onClick={() => props.onPassword(!props.settingPassword)}
              >
                {t('staff.setPassword')}
              </button>
              <button
                type="button"
                className={secondaryButtonClass}
                aria-label={t(s.active ? 'staff.deactivateName' : 'staff.reactivateName', { name: s.name })}
                disabled={props.busy}
                onClick={props.onToggle}
              >
                {t(s.active ? 'staff.deactivate' : 'staff.reactivate')}
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
  const { t } = useI18n()
  const [error, setError] = useState<string | undefined>()
  const save = useMutation({
    mutationFn: (password: string) => api.setStaffPassword(s.id, password),
    onSuccess: onDone,
    onError: (e) => setError(e instanceof ApiError && e.fields.password ? e.fields.password : errorText(e, t)),
  })
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(undefined)
    save.mutate(String(new FormData(e.currentTarget).get('password') ?? ''))
  }
  return (
    <form onSubmit={submit} noValidate aria-label={t('staff.passwordForm', { name: s.name })} className="flex flex-wrap items-end gap-2">
      <div className="min-w-64 flex-1">
        <Field label={t('staff.newPasswordFor', { name: s.name })} error={error} hint={t('staff.newPasswordHint')}>
          {(p) => <input {...p} name="password" type="password" autoComplete="new-password" className={`${inputClass} w-full`} />}
        </Field>
      </div>
      <button type="submit" className={buttonClass} disabled={save.isPending}>
        {t('staff.savePassword')}
      </button>
      <button type="button" className={secondaryButtonClass} onClick={onCancel}>
        {t('common.cancel')}
      </button>
    </form>
  )
}

function AddStaff() {
  const { t } = useI18n()
  const client = useQueryClient()
  const [fields, setFields] = useState<Record<string, string>>({})
  const [added, setAdded] = useState<string | null>(null)
  const add = useMutation({
    mutationFn: api.addStaff,
    onSuccess: (s) => {
      setAdded(t('staff.added', { name: s.name, username: s.username }))
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
        {t('staff.addTitle')}
      </h2>
      {add.isError && Object.keys(fields).length === 0 && <ErrorNote>{errorText(add.error, t)}</ErrorNote>}
      {added && (
        <p role="status" className="text-sm text-teal-900">
          {added}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('staff.fullName')} error={fields.name}>
          {(p) => <input {...p} name="name" autoComplete="off" className={inputClass} />}
        </Field>
        <Field label={t('staff.username')} error={fields.username} hint={t('staff.usernameHint')}>
          {(p) => <input {...p} name="username" autoComplete="off" autoCapitalize="none" className={`${inputClass} font-mono`} />}
        </Field>
        <Field label={t('staff.role')} error={fields.role}>
          {(p) => (
            <select {...p} name="role" defaultValue="TECHNICIAN" className={inputClass}>
              <option value="TECHNICIAN">{t('role.TECHNICIAN')}</option>
              <option value="ADVISOR">{t('role.ADVISOR')}</option>
            </select>
          )}
        </Field>
        <Field label={t('staff.firstPassword')} error={fields.password} hint={t('staff.firstPasswordHint')}>
          {(p) => <input {...p} name="password" type="password" autoComplete="new-password" className={inputClass} />}
        </Field>
      </div>
      <div>
        <button type="submit" className={buttonClass} disabled={add.isPending}>
          {add.isPending ? t('staff.adding') : t('staff.add')}
        </button>
      </div>
    </form>
  )
}
