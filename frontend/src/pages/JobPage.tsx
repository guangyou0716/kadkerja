import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { api, ApiError, type JobCard, type LineKind } from '../api'
import { buttonClass, ErrorNote, Field, inputClass, secondaryButtonClass, StatusBadge } from '../components'
import { mayMove, mayWorkOn, useMe } from '../session'
import { customerLink, whatsappText, whatsappUrl } from '../link'
import { formatRm, parseRm } from '../money'
import { errorText } from '../errors'
import { useI18n } from '../i18n/context'
import { LANG_NAME, LANG_TAG, LANGS, isLang, type Lang } from '../i18n/core'
import { MOVE_KEY, STATUS_KEY, type JobStatus } from '../status'
import { JobPhotos } from './JobPhotos'

export function JobPage() {
  const { t, number } = useI18n()
  const id = Number(useParams().id)
  const me = useMe()
  const client = useQueryClient()
  const job = useQuery({ queryKey: ['job', id], queryFn: () => api.job(id), enabled: Number.isInteger(id) })
  // Every change returns the whole job card: show it at once and refresh the board.
  const onSaved = (saved: JobCard) => {
    client.setQueryData(['job', id], saved)
    void client.invalidateQueries({ queryKey: ['jobs'] })
  }

  if (!Number.isInteger(id)) return <ErrorNote>{t('job.notALink')}</ErrorNote>
  if (job.isPending) return <p className="text-slate-700">{t('job.loading')}</p>
  if (job.isError) return <ErrorNote>{errorText(job.error, t)}</ErrorNote>
  const j = job.data
  // A technician can look at someone else's job but not change it (the server refuses too).
  const mine = mayWorkOn(me, j.assignedTo)
  return (
    <article aria-labelledby="job-title" className="flex flex-col gap-4">
      <Link to="/" className="text-sm font-medium text-teal-800 underline">
        {t('job.backToBoard')}
      </Link>
      <header className="flex flex-wrap items-center gap-3">
        <h1 id="job-title" className="font-mono text-2xl font-bold tracking-wide text-slate-900">
          {j.vehicle.plate}
        </h1>
        <StatusBadge status={j.status} />
        <span className="text-sm text-slate-700">{j.number}</span>
      </header>
      <div className="grid gap-4 lg:grid-cols-3">
        <section aria-label={t('job.carAndCustomer')} className="rounded-lg bg-white p-4 shadow-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-600">{t('job.car')}</dt>
            <dd className="text-slate-900">
              {j.vehicle.make} {j.vehicle.model}
              {j.vehicle.year ? ` (${j.vehicle.year})` : ''}
            </dd>
            <dt className="text-slate-600">{t('job.mileage')}</dt>
            <dd className="text-slate-900">{j.mileageKm != null ? t('job.km', { km: number(j.mileageKm) }) : '—'}</dd>
            <dt className="text-slate-600">{t('job.customer')}</dt>
            <dd className="text-slate-900">{j.customer.name}</dd>
            <dt className="text-slate-600">{t('job.phone')}</dt>
            <dd className="text-slate-900">{j.customer.phone}</dd>
            <dt className="text-slate-600">{t('job.complaint')}</dt>
            <dd className="text-slate-900">{j.complaint}</dd>
            <dt className="text-slate-600">{t('job.technician')}</dt>
            <dd className="text-slate-900">
              {j.assignedTo ? (j.assignedTo.id === me.id ? t('job.assigneeYou', { name: j.assignedTo.name }) : j.assignedTo.name) : t('job.notAssigned')}
            </dd>
          </dl>
        </section>
        <Quote job={j} onSaved={onSaved} canEdit={mine} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4">
          {mine ? (
            <Moves job={j} onSaved={onSaved} />
          ) : (
            <section aria-label={t('job.nextStep')} className="rounded-lg bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-700">{t('job.assignedToOther', { name: j.assignedTo?.name ?? '' })}</p>
            </section>
          )}
          {me.role === 'ADVISOR' && <AssignTechnician job={j} onSaved={onSaved} />}
          {me.role === 'ADVISOR' && <CustomerLink job={j} onSaved={onSaved} />}
        </div>
        <Timeline job={j} />
      </div>
      <JobPhotos job={j} canEdit={mine} />
    </article>
  )
}

function Quote({ job, onSaved, canEdit }: { job: JobCard; onSaved: (j: JobCard) => void; canEdit: boolean }) {
  const { t } = useI18n()
  const open = job.status === 'RECEIVED' || job.status === 'INSPECTING'
  const editable = open && canEdit
  const remove = useMutation({ mutationFn: (lineId: number) => api.removeLine(job.id, lineId), onSuccess: onSaved })
  return (
    <section aria-labelledby="quote-title" className="rounded-lg bg-white p-4 shadow-sm lg:col-span-2">
      <h2 id="quote-title" className="mb-2 font-semibold text-slate-900">
        {job.quoteVersion > 0 ? t('quote.titleVersion', { version: job.quoteVersion }) : t('quote.title')}
      </h2>
      {remove.isError && <ErrorNote>{errorText(remove.error, t)}</ErrorNote>}
      {job.lines.length === 0 ? (
        <p className="text-sm text-slate-700">{t('quote.noLines')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-700">
                <th className="py-1 pr-2 font-medium">{t('quote.item')}</th>
                <th className="py-1 pr-2 text-right font-medium">{t('quote.qty')}</th>
                <th className="py-1 pr-2 text-right font-medium">{t('quote.unit')}</th>
                <th className="py-1 pr-2 text-right font-medium">{t('quote.amount')}</th>
                {editable && <th className="py-1"><span className="sr-only">{t('quote.remove')}</span></th>}
              </tr>
            </thead>
            <tbody>
              {job.lines.map((l) => (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="py-1.5 pr-2 text-slate-900">
                    <span className="mr-2 rounded bg-slate-100 px-1.5 text-xs text-slate-700">
                      {t(l.kind === 'LABOUR' ? 'quote.kind.LABOUR' : 'quote.kind.PART')}
                    </span>
                    {l.description}
                    {l.partSku && (
                      <span className="ml-2 rounded bg-teal-50 px-1.5 font-mono text-xs text-teal-900" title={t('quote.stockTitle')}>
                        {t('quote.stock', { sku: l.partSku })}
                      </span>
                    )}
                    {!l.taxable && <span className="ml-1 text-xs text-slate-600">{t('quote.noSst')}</span>}
                  </td>
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap tabular-nums">{l.quantity}</td>
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap tabular-nums">{formatRm(l.unitPriceSen)}</td>
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap tabular-nums">{formatRm(l.subtotalSen)}</td>
                  {editable && (
                    <td className="py-1.5 text-right">
                      <button
                        type="button"
                        className="rounded px-2 py-1 text-rose-800 hover:bg-rose-50"
                        aria-label={t('quote.removeLine', { description: l.description })}
                        onClick={() => remove.mutate(l.id)}
                      >
                        {t('quote.remove')}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="text-slate-900">
              <tr>
                <td colSpan={3} className="pt-2 pr-2 text-right">{t('quote.subtotal')}</td>
                <td className="pt-2 pr-2 text-right whitespace-nowrap tabular-nums">{formatRm(job.subtotalSen)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="pr-2 text-right">{t('quote.sst', { rate: job.sstRatePercent })}</td>
                <td className="pr-2 text-right whitespace-nowrap tabular-nums">{formatRm(job.taxSen)}</td>
              </tr>
              <tr className="font-bold">
                <td colSpan={3} className="pr-2 text-right">{t('quote.total')}</td>
                <td className="pr-2 text-right whitespace-nowrap tabular-nums" data-testid="total">{formatRm(job.totalSen)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {editable ? (
        <AddLine job={job} onSaved={onSaved} />
      ) : open ? null : (
        <p className="mt-3 text-xs text-slate-600">
          {t('quote.locked')}
        </p>
      )}
    </section>
  )
}

function AddLine({ job, onSaved }: { job: JobCard; onSaved: (j: JobCard) => void }) {
  const { t } = useI18n()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const parts = useQuery({ queryKey: ['parts'], queryFn: api.parts })
  // Picking a stock part fills in the line; the description and price can still be changed.
  const [partId, setPartId] = useState('')
  const [kind, setKind] = useState<LineKind>('PART')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const clear = () => {
    setPartId('')
    setKind('PART')
    setDescription('')
    setPrice('')
  }
  function pick(id: string) {
    setPartId(id)
    const part = parts.data?.find((p) => String(p.id) === id)
    if (part) {
      setKind('PART')
      setDescription(part.name)
      setPrice((part.unitPriceSen / 100).toFixed(2))
    }
  }
  const add = useMutation({
    mutationFn: (line: Parameters<typeof api.addLine>[1]) => api.addLine(job.id, line),
    onSuccess: onSaved,
    onError: (e) => setErrors(e instanceof ApiError ? e.fields : {}),
  })
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const priceSen = parseRm(price)
    const quantity = Number(f.get('quantity'))
    const local: Record<string, string> = {}
    if (priceSen == null) local.unitPriceSen = t('amount.hint')
    if (!Number.isInteger(quantity) || quantity < 1) local.quantity = t('number.atLeastOne')
    setErrors(local)
    if (Object.keys(local).length > 0) return
    add.mutate(
      {
        kind,
        description,
        quantity,
        unitPriceSen: priceSen!,
        taxable: f.get('taxable') === 'on',
        ...(partId && kind === 'PART' ? { partId: Number(partId) } : {}),
      },
      {
        onSuccess: () => {
          form.reset()
          clear()
        },
      },
    )
  }
  return (
    <form onSubmit={submit} noValidate aria-label={t('line.form')} className="mt-4 grid gap-3 sm:grid-cols-6">
      {add.isError && Object.keys(errors).length === 0 && (
        <div className="sm:col-span-6">
          <ErrorNote>{errorText(add.error, t)}</ErrorNote>
        </div>
      )}
      <div className="sm:col-span-6">
        <Field label={t('line.fromStock')} hint={t('line.fromStockHint')}>
          {(p) => (
            <select {...p} name="partId" className={inputClass} value={partId} onChange={(e) => pick(e.target.value)}>
              <option value="">{t('line.notFromStock')}</option>
              {(parts.data ?? []).map((part) => (
                <option key={part.id} value={part.id}>
                  {t('line.stockOption', { sku: part.sku, name: part.name, onHand: part.onHand })}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <div className="sm:col-span-1">
        <Field label={t('line.kind')}>
          {(p) => (
            <select
              {...p}
              name="kind"
              className={inputClass}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as LineKind)
                // Labour never takes a part from the shelf.
                if (e.target.value === 'LABOUR') setPartId('')
              }}
            >
              <option value="PART">{t('quote.kind.PART')}</option>
              <option value="LABOUR">{t('quote.kind.LABOUR')}</option>
            </select>
          )}
        </Field>
      </div>
      <div className="sm:col-span-3">
        <Field label={t('line.description')} error={errors.description}>
          {(p) => <input {...p} name="description" className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
      </div>
      <div className="sm:col-span-1">
        <Field label={t('line.qty')} error={errors.quantity}>
          {(p) => <input {...p} name="quantity" type="number" min={1} defaultValue={1} className={inputClass} />}
        </Field>
      </div>
      <div className="sm:col-span-1">
        <Field label={t('line.unitPrice')} error={errors.unitPriceSen}>
          {(p) => <input {...p} name="price" inputMode="decimal" className={inputClass} value={price} onChange={(e) => setPrice(e.target.value)} />}
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-800 sm:col-span-3">
        <input type="checkbox" name="taxable" defaultChecked className="size-4 accent-teal-700" /> {t('line.sstApplies')}
      </label>
      <div className="sm:col-span-3 sm:text-right">
        <button type="submit" className={buttonClass} disabled={add.isPending}>
          {t('line.add')}
        </button>
      </div>
    </form>
  )
}

/** The advisor gives the car to a technician (or takes it back). */
function AssignTechnician({ job, onSaved }: { job: JobCard; onSaved: (j: JobCard) => void }) {
  const { t } = useI18n()
  const staff = useQuery({ queryKey: ['staff'], queryFn: api.staff })
  const current = job.assignedTo ? String(job.assignedTo.id) : ''
  const [picked, setPicked] = useState(current)
  const [shownFor, setShownFor] = useState(current)
  // The job changed under us (saved here, or reloaded): show what the server has now.
  if (shownFor !== current) {
    setShownFor(current)
    setPicked(current)
  }
  const assign = useMutation({
    mutationFn: (staffId: number | null) => api.assign(job.id, staffId),
    onSuccess: onSaved,
  })
  if (job.next.length === 0) return null
  const technicians = (staff.data ?? []).filter((s) => s.role === 'TECHNICIAN' && s.active)
  // Someone who has since left still shows as the current assignee.
  const gone = job.assignedTo && !technicians.some((t) => t.id === job.assignedTo!.id) ? job.assignedTo : null
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    assign.mutate(picked === '' ? null : Number(picked))
  }
  return (
    <form onSubmit={submit} aria-labelledby="assign-title" className="flex flex-col gap-3 rounded-lg bg-white p-4 shadow-sm">
      <h2 id="assign-title" className="font-semibold text-slate-900">
        {t('assign.title')}
      </h2>
      {staff.isError && <ErrorNote>{errorText(staff.error, t)}</ErrorNote>}
      {assign.isError && <ErrorNote>{errorText(assign.error, t)}</ErrorNote>}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Field label={t('assign.assignedTo')}>
            {(p) => (
              <select {...p} value={picked} onChange={(e) => setPicked(e.target.value)} disabled={staff.isPending} className={`${inputClass} w-full`}>
                <option value="">{t('assign.nobody')}</option>
                {gone && <option value={String(gone.id)}>{t('assign.gone', { name: gone.name })}</option>}
                {technicians.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <button type="submit" className={secondaryButtonClass} disabled={assign.isPending || picked === current}>
          {picked === '' && current !== '' ? t('assign.unassign') : t('assign.assign')}
        </button>
      </div>
    </form>
  )
}

function Moves({ job, onSaved }: { job: JobCard; onSaved: (j: JobCard) => void }) {
  const { t } = useI18n()
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
      <section aria-label={t('job.nextStep')} className="rounded-lg bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-700">{t(job.status === 'CANCELLED' ? 'moves.finishedCancelled' : 'moves.finishedCollected')}</p>
      </section>
    )
  }
  // Forward moves first, then going back to redo the quote, cancelling last.
  const rank = (s: JobStatus) => (s === 'CANCELLED' ? 2 : s === 'INSPECTING' && job.status === 'QUOTED' ? 1 : 0)
  const ordered = [...job.next].filter((to) => mayMove(me, job.status, to)).sort((a, b) => rank(a) - rank(b))
  if (ordered.length === 0) {
    return (
      <section aria-label={t('job.nextStep')} className="rounded-lg bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-700">{t('moves.forAdvisor')}</p>
      </section>
    )
  }
  return (
    <section aria-labelledby="next-title" className="flex flex-col gap-3 rounded-lg bg-white p-4 shadow-sm">
      <h2 id="next-title" className="font-semibold text-slate-900">
        {t('job.nextStep')}
      </h2>
      {move.isError && <ErrorNote>{errorText(move.error, t)}</ErrorNote>}
      <Field label={t('moves.note')}>
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
            {to === 'INSPECTING' && job.status === 'QUOTED' ? t('move.redoQuote') : t(MOVE_KEY[to])}
          </button>
        ))}
      </div>
    </section>
  )
}

function Timeline({ job }: { job: JobCard }) {
  const { t, when } = useI18n()
  return (
    <section aria-labelledby="timeline-title" className="rounded-lg bg-white p-4 shadow-sm lg:col-span-2">
      <h2 id="timeline-title" className="mb-2 font-semibold text-slate-900">
        {t('timeline.title')}
      </h2>
      <ol className="flex flex-col gap-2 border-l-2 border-teal-700 pl-4">
        {job.events.map((e, i) => (
          <li key={i} className="text-sm">
            <span className="font-medium text-slate-900">{t(STATUS_KEY[e.to])}</span>
            {e.by === 'CUSTOMER' && <span className="ml-1 text-slate-700">{t('timeline.byCustomer')}</span>}
            <span className="ml-2 text-slate-600">{when(e.at)}</span>
            {e.note && <p className="text-slate-800">{e.note}</p>}
          </li>
        ))}
      </ol>
    </section>
  )
}

function CustomerLink({ job, onSaved }: { job: JobCard; onSaved: (j: JobCard) => void }) {
  const { t, lang } = useI18n()
  // The customer may read another language than the person at the desk.
  const [messageLang, setMessageLang] = useState<Lang>(lang)
  const [copied, setCopied] = useState(false)
  const reset = useMutation({ mutationFn: () => api.resetLink(job.id), onSuccess: onSaved })
  const link = customerLink(window.location.origin, job.publicToken)
  // The link in the message opens the page in the message's language.
  const text = whatsappText(job, customerLink(window.location.origin, job.publicToken, messageLang), messageLang)
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
        {t('link.title')}
      </h2>
      <p className="text-sm text-slate-700">{t(job.status === 'QUOTED' ? 'link.infoQuoted' : 'link.info')}</p>
      <input readOnly aria-label={t('link.title')} value={link} className={`${inputClass} font-mono text-xs`} onFocus={(e) => e.target.select()} />
      {reset.isError && <ErrorNote>{errorText(reset.error, t)}</ErrorNote>}
      <div className="flex flex-wrap items-center gap-2">
        <a href={whatsappUrl(job.customer.phone, text)} target="_blank" rel="noreferrer" className={buttonClass}>
          {t('link.whatsapp')}
        </a>
        <label className="flex items-center gap-1 text-sm text-slate-800">
          {t('link.messageLanguage')}
          <select
            value={messageLang}
            onChange={(e) => isLang(e.target.value) && setMessageLang(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-teal-700"
          >
            {LANGS.map((l) => (
              <option key={l} value={l} lang={LANG_TAG[l]}>
                {LANG_NAME[l]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryButtonClass} onClick={() => void copy()}>
          {copied ? t('link.copied') : t('link.copy')}
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          disabled={reset.isPending}
          onClick={() => {
            if (window.confirm(t('link.newConfirm'))) {
              setCopied(false)
              reset.mutate()
            }
          }}
        >
          {t('link.new')}
        </button>
      </div>
    </section>
  )
}
