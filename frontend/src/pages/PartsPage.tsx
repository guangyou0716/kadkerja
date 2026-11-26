import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { api, ApiError, type Part, type StockMovement } from '../api'
import { buttonClass, ErrorNote, Field, inputClass, secondaryButtonClass } from '../components'
import { formatRm, parseRm } from '../money'
import { useMe } from '../session'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

/** "Low", "3 to order" or nothing, so a short shelf stands out without relying on colour alone. */
function stockNote(p: Part): { text: string; className: string } | null {
  if (p.onHand < 0) return { text: `${-p.onHand} to order`, className: 'bg-rose-100 text-rose-900' }
  if (p.low) return { text: 'Low', className: 'bg-amber-100 text-amber-900' }
  return null
}

type Open = { id: number; what: 'receive' | 'count' | 'history' } | null

/** The parts shelf. Everyone can look; the service advisor adds parts, receives deliveries and counts. */
export function PartsPage() {
  const me = useMe()
  const advisor = me.role === 'ADVISOR'
  const parts = useQuery({ queryKey: ['parts'], queryFn: api.parts })
  const [open, setOpen] = useState<Open>(null)
  const toggle = (id: number, what: NonNullable<Open>['what']) =>
    setOpen((o) => (o?.id === id && o.what === what ? null : { id, what }))
  return (
    <section aria-labelledby="parts-title" className="flex max-w-5xl flex-col gap-4">
      <div>
        <h1 id="parts-title" className="text-2xl font-bold text-slate-900">
          Parts
        </h1>
        <p className="text-sm text-slate-700">
          A quote line can take a part from this shelf. The part comes off the count when the quote is approved, by the
          customer on their link or by the service advisor. Approval is never blocked by an empty shelf: the count goes
          below zero and shows how many to order.
        </p>
      </div>
      {parts.isPending ? (
        <p className="text-slate-700">Loading parts…</p>
      ) : parts.isError ? (
        <ErrorNote>{parts.error.message}</ErrorNote>
      ) : parts.data.length === 0 ? (
        <p className="rounded-lg bg-white p-4 text-sm text-slate-700 shadow-sm">No parts yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white p-4 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-700">
                <th className="py-1 pr-3 font-medium">Part no.</th>
                <th className="py-1 pr-3 font-medium">Name</th>
                <th className="hidden py-1 pr-3 text-right font-medium sm:table-cell">Price</th>
                <th className="py-1 pr-3 text-right font-medium">On hand</th>
                <th className="py-1 pr-3 font-medium">
                  <span className="sr-only">Stock note</span>
                </th>
                <th className="py-1 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {parts.data.map((p) => {
                const note = stockNote(p)
                const isOpen = open?.id === p.id
                return (
                  <PartRows key={p.id} part={p} open={isOpen ? open.what : null} onDone={() => setOpen(null)}>
                    <td className="py-1.5 pr-3 font-mono whitespace-nowrap text-slate-900">{p.sku}</td>
                    <td className="py-1.5 pr-3 text-slate-900">{p.name}</td>
                    <td className="hidden py-1.5 pr-3 text-right whitespace-nowrap tabular-nums sm:table-cell">{formatRm(p.unitPriceSen)}</td>
                    <td className="py-1.5 pr-3 text-right font-semibold whitespace-nowrap tabular-nums" data-testid={`on-hand-${p.sku}`}>
                      {p.onHand}
                    </td>
                    <td className="py-1.5 pr-3">
                      {note && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${note.className}`}>{note.text}</span>}
                    </td>
                    <td className="py-1.5 text-right">
                      <div className="flex flex-col items-end sm:flex-row sm:justify-end">
                      {advisor && (
                        <>
                          <RowButton label={`Receive ${p.sku}`} onClick={() => toggle(p.id, 'receive')}>
                            Receive
                          </RowButton>
                          <RowButton label={`Count ${p.sku}`} onClick={() => toggle(p.id, 'count')}>
                            Count
                          </RowButton>
                        </>
                      )}
                      <RowButton label={`History of ${p.sku}`} onClick={() => toggle(p.id, 'history')}>
                        History
                      </RowButton>
                      </div>
                    </td>
                  </PartRows>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {advisor && <AddPart />}
    </section>
  )
}

function RowButton({ label, onClick, children }: { label: string; onClick: () => void; children: string }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="rounded px-2 py-1 font-medium text-teal-800 hover:bg-teal-50">
      {children}
    </button>
  )
}

function PartRows({
  part,
  open,
  onDone,
  children,
}: {
  part: Part
  open: NonNullable<Open>['what'] | null
  onDone: () => void
  children: ReactNode
}) {
  return (
    <>
      <tr className="border-b border-slate-100">{children}</tr>
      {open && (
        <tr className="border-b border-slate-100 bg-slate-50">
          <td colSpan={6} className="p-3">
            {open === 'history' ? <History part={part} /> : <ChangeCount part={part} what={open} onDone={onDone} />}
          </td>
        </tr>
      )}
    </>
  )
}

function ChangeCount({ part, what, onDone }: { part: Part; what: 'receive' | 'count'; onDone: () => void }) {
  const client = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: (n: number) => (what === 'receive' ? api.receivePart(part.id, n) : api.countPart(part.id, n)),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['parts'] })
      void client.invalidateQueries({ queryKey: ['part-history', part.id] })
      onDone()
    },
    onError: (e) => setError(e instanceof ApiError && Object.values(e.fields)[0] ? Object.values(e.fields)[0] : e.message),
  })
  const label = what === 'receive' ? `How many ${part.sku} arrived?` : `How many ${part.sku} are on the shelf?`
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const n = Number(new FormData(e.currentTarget).get('n'))
    const min = what === 'receive' ? 1 : 0
    if (!Number.isInteger(n) || n < min) {
      setError(what === 'receive' ? 'At least 1' : 'A whole number, 0 or more')
      return
    }
    setError(null)
    save.mutate(n)
  }
  return (
    <form onSubmit={submit} noValidate aria-label={what === 'receive' ? `Receive ${part.sku}` : `Count ${part.sku}`} className="flex flex-wrap items-end gap-3">
      <Field label={label} error={error ?? undefined}>
        {(p) => <input {...p} name="n" type="number" min={what === 'receive' ? 1 : 0} defaultValue={what === 'count' ? Math.max(part.onHand, 0) : 1} className={`${inputClass} w-32`} autoFocus />}
      </Field>
      <button type="submit" className={buttonClass} disabled={save.isPending}>
        {what === 'receive' ? 'Add to stock' : 'Save count'}
      </button>
      <button type="button" className={secondaryButtonClass} onClick={onDone}>
        Cancel
      </button>
    </form>
  )
}

function movementText(m: StockMovement) {
  if (m.reason === 'TAKEN') return m.by ? `Taken for ${m.jobNumber ?? 'a removed job'} (approved by ${m.by})` : `Taken for ${m.jobNumber ?? 'a removed job'} (customer approved)`
  if (m.reason === 'RECEIVED') return `Received by ${m.by ?? 'staff'}`
  return `Counted by ${m.by ?? 'staff'}`
}

function History({ part }: { part: Part }) {
  const history = useQuery({ queryKey: ['part-history', part.id], queryFn: () => api.partHistory(part.id) })
  if (history.isPending) return <p className="text-sm text-slate-700">Loading history…</p>
  if (history.isError) return <ErrorNote>{history.error.message}</ErrorNote>
  if (history.data.length === 0) return <p className="text-sm text-slate-700">No changes yet.</p>
  return (
    <ol aria-label={`History of ${part.sku}`} className="flex flex-col gap-1 text-sm">
      {history.data.map((m) => (
        <li key={m.id} className="flex flex-wrap gap-x-3">
          <span className={`w-12 text-right font-semibold tabular-nums ${m.change < 0 ? 'text-rose-800' : 'text-teal-800'}`}>
            {m.change > 0 ? `+${m.change}` : m.change}
          </span>
          <span className="text-slate-900">
            {m.jobId ? (
              <Link to={`/jobs/${m.jobId}`} className="text-teal-800 underline">
                {movementText(m)}
              </Link>
            ) : (
              movementText(m)
            )}
          </span>
          <span className="text-slate-600">{when(m.at)}</span>
        </li>
      ))}
    </ol>
  )
}

function AddPart() {
  const client = useQueryClient()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [done, setDone] = useState<string | null>(null)
  const add = useMutation({
    mutationFn: api.addPart,
    onSuccess: (p) => {
      setDone(`${p.sku} added with ${p.onHand} on hand.`)
      void client.invalidateQueries({ queryKey: ['parts'] })
    },
    onError: (e) => setErrors(e instanceof ApiError ? e.fields : {}),
  })
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const price = parseRm(String(f.get('price') ?? ''))
    const onHand = Number(f.get('onHand'))
    const reorderLevel = Number(f.get('reorderLevel'))
    const local: Record<string, string> = {}
    if (price == null) local.unitPriceSen = 'Use an amount like 45 or 45.50'
    if (!Number.isInteger(onHand) || onHand < 0) local.onHand = 'A whole number, 0 or more'
    if (!Number.isInteger(reorderLevel) || reorderLevel < 0) local.reorderLevel = 'A whole number, 0 or more'
    setErrors(local)
    setDone(null)
    if (Object.keys(local).length > 0) return
    add.mutate(
      { sku: String(f.get('sku') ?? '').trim(), name: String(f.get('name') ?? ''), unitPriceSen: price!, onHand, reorderLevel },
      { onSuccess: () => form.reset() },
    )
  }
  return (
    <form onSubmit={submit} noValidate aria-labelledby="add-part-title" className="grid gap-3 rounded-lg bg-white p-4 shadow-sm sm:grid-cols-6">
      <h2 id="add-part-title" className="font-semibold text-slate-900 sm:col-span-6">
        Add a part
      </h2>
      {add.isError && Object.keys(errors).length === 0 && (
        <div className="sm:col-span-6">
          <ErrorNote>{add.error.message}</ErrorNote>
        </div>
      )}
      {done && (
        <p role="status" className="text-sm text-teal-900 sm:col-span-6">
          {done}
        </p>
      )}
      <div className="sm:col-span-2">
        <Field label="Part number" error={errors.sku} hint="Letters, digits, dots, dashes, slashes">
          {(p) => <input {...p} name="sku" className={inputClass} autoComplete="off" />}
        </Field>
      </div>
      <div className="sm:col-span-4">
        <Field label="Part name" error={errors.name}>
          {(p) => <input {...p} name="name" className={inputClass} />}
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Price (RM)" error={errors.unitPriceSen}>
          {(p) => <input {...p} name="price" inputMode="decimal" className={inputClass} />}
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="On hand now" error={errors.onHand}>
          {(p) => <input {...p} name="onHand" type="number" min={0} defaultValue={0} className={inputClass} />}
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Low at" error={errors.reorderLevel} hint="Shown as low at or below this">
          {(p) => <input {...p} name="reorderLevel" type="number" min={0} defaultValue={1} className={inputClass} />}
        </Field>
      </div>
      <div className="sm:col-span-6 sm:text-right">
        <button type="submit" className={buttonClass} disabled={add.isPending}>
          Add part
        </button>
      </div>
    </form>
  )
}
