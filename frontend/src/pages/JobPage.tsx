import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { api, ApiError, type JobCard, type LineKind } from '../api'
import { buttonClass, ErrorNote, Field, inputClass, secondaryButtonClass, StatusBadge } from '../components'
import { mayMove, useMe } from '../session'
import { customerLink, whatsappText, whatsappUrl } from '../link'
import { formatRm, parseRm } from '../money'
import { MOVE_LABEL, STATUS_LABEL, type JobStatus } from '../status'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

export function JobPage() {
  const id = Number(useParams().id)
  const me = useMe()
  const client = useQueryClient()
  const job = useQuery({ queryKey: ['job', id], queryFn: () => api.job(id), enabled: Number.isInteger(id) })
  // Every change returns the whole job card: show it at once and refresh the board.
  const onSaved = (saved: JobCard) => {
    client.setQueryData(['job', id], saved)
    void client.invalidateQueries({ queryKey: ['jobs'] })
  }

  if (!Number.isInteger(id)) return <ErrorNote>That is not a job card link.</ErrorNote>
  if (job.isPending) return <p className="text-slate-700">Loading job card…</p>
  if (job.isError) return <ErrorNote>{job.error.message}</ErrorNote>
  const j = job.data
  return (
    <article aria-labelledby="job-title" className="flex flex-col gap-4">
      <Link to="/" className="text-sm font-medium text-teal-800 underline">
        ← Job board
      </Link>
      <header className="flex flex-wrap items-center gap-3">
        <h1 id="job-title" className="font-mono text-2xl font-bold tracking-wide text-slate-900">
          {j.vehicle.plate}
        </h1>
        <StatusBadge status={j.status} />
        <span className="text-sm text-slate-700">{j.number}</span>
      </header>
      <div className="grid gap-4 lg:grid-cols-3">
        <section aria-label="Car and customer" className="rounded-lg bg-white p-4 shadow-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-600">Car</dt>
            <dd className="text-slate-900">
              {j.vehicle.make} {j.vehicle.model}
              {j.vehicle.year ? ` (${j.vehicle.year})` : ''}
            </dd>
            <dt className="text-slate-600">Mileage</dt>
            <dd className="text-slate-900">{j.mileageKm != null ? `${j.mileageKm.toLocaleString('en-MY')} km` : '—'}</dd>
            <dt className="text-slate-600">Customer</dt>
            <dd className="text-slate-900">{j.customer.name}</dd>
            <dt className="text-slate-600">Phone</dt>
            <dd className="text-slate-900">{j.customer.phone}</dd>
            <dt className="text-slate-600">Complaint</dt>
            <dd className="text-slate-900">{j.complaint}</dd>
          </dl>
        </section>
        <Quote job={j} onSaved={onSaved} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4">
          <Moves job={j} onSaved={onSaved} />
          {me.role === 'ADVISOR' && <CustomerLink job={j} onSaved={onSaved} />}
        </div>
        <Timeline job={j} />
      </div>
    </article>
  )
}

function Quote({ job, onSaved }: { job: JobCard; onSaved: (j: JobCard) => void }) {
  const editable = job.status === 'RECEIVED' || job.status === 'INSPECTING'
  const remove = useMutation({ mutationFn: (lineId: number) => api.removeLine(job.id, lineId), onSuccess: onSaved })
  return (
    <section aria-labelledby="quote-title" className="rounded-lg bg-white p-4 shadow-sm lg:col-span-2">
      <h2 id="quote-title" className="mb-2 font-semibold text-slate-900">
        Quote{job.quoteVersion > 0 ? ` (version ${job.quoteVersion})` : ''}
      </h2>
      {remove.isError && <ErrorNote>{remove.error.message}</ErrorNote>}
      {job.lines.length === 0 ? (
        <p className="text-sm text-slate-700">No lines yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-700">
                <th className="py-1 pr-2 font-medium">Item</th>
                <th className="py-1 pr-2 text-right font-medium">Qty</th>
                <th className="py-1 pr-2 text-right font-medium">Unit</th>
                <th className="py-1 pr-2 text-right font-medium">Amount</th>
                {editable && <th className="py-1"><span className="sr-only">Remove</span></th>}
              </tr>
            </thead>
            <tbody>
              {job.lines.map((l) => (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="py-1.5 pr-2 text-slate-900">
                    <span className="mr-2 rounded bg-slate-100 px-1.5 text-xs text-slate-700">
                      {l.kind === 'LABOUR' ? 'Labour' : 'Part'}
                    </span>
                    {l.description}
                    {!l.taxable && <span className="ml-1 text-xs text-slate-600">(no SST)</span>}
                  </td>
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap tabular-nums">{l.quantity}</td>
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap tabular-nums">{formatRm(l.unitPriceSen)}</td>
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap tabular-nums">{formatRm(l.subtotalSen)}</td>
                  {editable && (
                    <td className="py-1.5 text-right">
                      <button
                        type="button"
                        className="rounded px-2 py-1 text-rose-800 hover:bg-rose-50"
                        aria-label={`Remove ${l.description}`}
                        onClick={() => remove.mutate(l.id)}
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="text-slate-900">
              <tr>
                <td colSpan={3} className="pt-2 pr-2 text-right">Subtotal</td>
                <td className="pt-2 pr-2 text-right whitespace-nowrap tabular-nums">{formatRm(job.subtotalSen)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="pr-2 text-right">SST {job.sstRatePercent}%</td>
                <td className="pr-2 text-right whitespace-nowrap tabular-nums">{formatRm(job.taxSen)}</td>
              </tr>
              <tr className="font-bold">
                <td colSpan={3} className="pr-2 text-right">Total</td>
                <td className="pr-2 text-right whitespace-nowrap tabular-nums" data-testid="total">{formatRm(job.totalSen)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {editable ? (
        <AddLine job={job} onSaved={onSaved} />
      ) : (
        <p className="mt-3 text-xs text-slate-600">
          The quote is locked once sent. To change it, move the job back to inspection.
        </p>
      )}
    </section>
  )
}

function AddLine({ job, onSaved }: { job: JobCard; onSaved: (j: JobCard) => void }) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const add = useMutation({
    mutationFn: (line: Parameters<typeof api.addLine>[1]) => api.addLine(job.id, line),
    onSuccess: onSaved,
    onError: (e) => setErrors(e instanceof ApiError ? e.fields : {}),
  })
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const price = parseRm(String(f.get('price') ?? ''))
    const quantity = Number(f.get('quantity'))
    const local: Record<string, string> = {}
    if (price == null) local.unitPriceSen = 'Use an amount like 45 or 45.50'
    if (!Number.isInteger(quantity) || quantity < 1) local.quantity = 'At least 1'
    setErrors(local)
    if (Object.keys(local).length > 0) return
    add.mutate(
      {
        kind: f.get('kind') as LineKind,
        description: String(f.get('description') ?? ''),
        quantity,
        unitPriceSen: price!,
        taxable: f.get('taxable') === 'on',
      },
      { onSuccess: () => form.reset() },
    )
  }
  return (
    <form onSubmit={submit} noValidate aria-label="Add a quote line" className="mt-4 grid gap-3 sm:grid-cols-6">
      {add.isError && Object.keys(errors).length === 0 && (
        <div className="sm:col-span-6">
          <ErrorNote>{add.error.message}</ErrorNote>
        </div>
      )}
      <div className="sm:col-span-1">
        <Field label="Kind">
          {(p) => (
            <select {...p} name="kind" className={inputClass} defaultValue="PART">
              <option value="PART">Part</option>
              <option value="LABOUR">Labour</option>
            </select>
          )}
        </Field>
      </div>
      <div className="sm:col-span-3">
        <Field label="Description" error={errors.description}>
          {(p) => <input {...p} name="description" className={inputClass} />}
        </Field>
      </div>
      <div className="sm:col-span-1">
        <Field label="Qty" error={errors.quantity}>
          {(p) => <input {...p} name="quantity" type="number" min={1} defaultValue={1} className={inputClass} />}
        </Field>
      </div>
      <div className="sm:col-span-1">
        <Field label="Unit price (RM)" error={errors.unitPriceSen}>
          {(p) => <input {...p} name="price" inputMode="decimal" className={inputClass} />}
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-800 sm:col-span-3">
        <input type="checkbox" name="taxable" defaultChecked className="size-4 accent-teal-700" /> SST applies
      </label>
      <div className="sm:col-span-3 sm:text-right">
        <button type="submit" className={buttonClass} disabled={add.isPending}>
          Add line
        </button>
      </div>
    </form>
  )
}

function Moves({ job, onSaved }: { job: JobCard; onSaved: (j: JobCard) => void }) {
  const me = useMe()
  const [note, setNote] = useState('')
  const move = useMutation({
    mutationFn: (to: JobStatus) => api.move(job.id, to, note.trim()),
    onSuccess: (saved) => {
      setNote('')
      onSaved(saved)
    },
  })
  if (job.next.length === 0) {
    return (
      <section aria-label="Next step" className="rounded-lg bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-700">This job is {STATUS_LABEL[job.status].toLowerCase()}. Nothing more to do.</p>
      </section>
    )
  }
  // Forward moves first, then going back to redo the quote, cancelling last.
  const rank = (s: JobStatus) => (s === 'CANCELLED' ? 2 : s === 'INSPECTING' && job.status === 'QUOTED' ? 1 : 0)
  const ordered = [...job.next].filter((to) => mayMove(me, job.status, to)).sort((a, b) => rank(a) - rank(b))
  if (ordered.length === 0) {
    return (
      <section aria-label="Next step" className="rounded-lg bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-700">The next step is for the service advisor.</p>
      </section>
    )
  }
  return (
    <section aria-labelledby="next-title" className="flex flex-col gap-3 rounded-lg bg-white p-4 shadow-sm">
      <h2 id="next-title" className="font-semibold text-slate-900">
        Next step
      </h2>
      {move.isError && <ErrorNote>{move.error.message}</ErrorNote>}
      <Field label="Note (optional)">
        {(p) => <input {...p} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />}
      </Field>
      <div className="flex flex-wrap gap-2">
        {ordered.map((to) => (
          <button
            key={to}
            type="button"
            disabled={move.isPending}
            onClick={() => move.mutate(to)}
            className={to === 'CANCELLED' || to === 'INSPECTING' ? secondaryButtonClass : buttonClass}
          >
            {to === 'INSPECTING' && job.status === 'QUOTED' ? 'Redo quote' : MOVE_LABEL[to]}
          </button>
        ))}
      </div>
    </section>
  )
}

function Timeline({ job }: { job: JobCard }) {
  return (
    <section aria-labelledby="timeline-title" className="rounded-lg bg-white p-4 shadow-sm lg:col-span-2">
      <h2 id="timeline-title" className="mb-2 font-semibold text-slate-900">
        Timeline
      </h2>
      <ol className="flex flex-col gap-2 border-l-2 border-teal-700 pl-4">
        {job.events.map((e, i) => (
          <li key={i} className="text-sm">
            <span className="font-medium text-slate-900">{STATUS_LABEL[e.to]}</span>
            {e.by === 'CUSTOMER' && <span className="ml-1 text-slate-700">by customer (link)</span>}
            <span className="ml-2 text-slate-600">{when(e.at)}</span>
            {e.note && <p className="text-slate-800">{e.note}</p>}
          </li>
        ))}
      </ol>
    </section>
  )
}

function CustomerLink({ job, onSaved }: { job: JobCard; onSaved: (j: JobCard) => void }) {
  const [copied, setCopied] = useState(false)
  const reset = useMutation({ mutationFn: () => api.resetLink(job.id), onSuccess: onSaved })
  const link = customerLink(window.location.origin, job.publicToken)
  const text = whatsappText(job, link)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <section aria-labelledby="link-title" className="flex flex-col gap-2 rounded-lg bg-white p-4 shadow-sm">
      <h2 id="link-title" className="font-semibold text-slate-900">
        Customer link
      </h2>
      <p className="text-sm text-slate-700">
        No login needed: the customer sees progress{job.status === 'QUOTED' ? ' and can approve or decline the quote' : ''}.
      </p>
      <input readOnly aria-label="Customer link" value={link} className={`${inputClass} font-mono text-xs`} onFocus={(e) => e.target.select()} />
      {reset.isError && <ErrorNote>{reset.error.message}</ErrorNote>}
      <div className="flex flex-wrap gap-2">
        <a href={whatsappUrl(job.customer.phone, text)} target="_blank" rel="noreferrer" className={buttonClass}>
          Send on WhatsApp
        </a>
        <button type="button" className={secondaryButtonClass} onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={reset.isPending}
          onClick={() => {
            if (window.confirm('Make a new link? The old link stops working at once.')) {
              setCopied(false)
              reset.mutate()
            }
          }}
        >
          New link
        </button>
      </div>
    </section>
  )
}
