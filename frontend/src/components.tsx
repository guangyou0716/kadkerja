import type { ReactNode } from 'react'
import { STATUS_BADGE, STATUS_LABEL, type JobStatus } from './status'

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">
      {children}
    </p>
  )
}

export function Field({
  label,
  error,
  children,
  hint,
}: {
  label: string
  error?: string
  hint?: string
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode
}) {
  const id = `f-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        {label}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {error ? (
        <span id={`${id}-error`} className="text-sm text-rose-800">
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="text-xs text-slate-600">
          {hint}
        </span>
      ) : null}
    </div>
  )
}

export const inputClass =
  'rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:outline-2 focus:outline-teal-700 aria-[invalid=true]:border-rose-600'

export const buttonClass =
  'rounded-md bg-teal-700 px-4 py-2 font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-60'

export const secondaryButtonClass =
  'rounded-md border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-700 disabled:opacity-60'
