import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router'
import { api, ApiError, type Decision, type PublicJob } from '../api'
import { buttonClass, ErrorNote, inputClass, secondaryButtonClass } from '../components'
import { formatRm } from '../money'
import type { JobStatus } from '../status'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-MY', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

/** Status in the customer's words. */
const HEADLINE: Record<JobStatus, string> = {
  RECEIVED: 'We have your car',
  INSPECTING: 'We are checking your car',
  QUOTED: 'Your quote is ready',
  APPROVED: 'Quote approved – repair starts soon',
  DECLINED: 'Quote declined – your car will be returned',
  IN_PROGRESS: 'Your car is being repaired',
  READY: 'Ready to collect',
  COLLECTED: 'Collected – thank you',
  CANCELLED: 'This job was cancelled',
}

const STEP_LABEL: Record<JobStatus, string> = {
  RECEIVED: 'Checked in',
  INSPECTING: 'Inspection started',
  QUOTED: 'Quote sent',
  APPROVED: 'Quote approved',
  DECLINED: 'Quote declined',
  IN_PROGRESS: 'Repair started',
  READY: 'Ready to collect',
  COLLECTED: 'Collected',
  CANCELLED: 'Cancelled',
}

const STEPS = ['Checked in', 'Inspect', 'Quote', 'Repair', 'Ready', 'Collected'] as const
const STEP_OF: Record<JobStatus, number> = {
  RECEIVED: 0,
  INSPECTING: 1,
  QUOTED: 2,
  APPROVED: 3,
  DECLINED: 4, // skips the repair
  IN_PROGRESS: 3,
  READY: 4,
  COLLECTED: 5,
  CANCELLED: -1,
}

/** The page behind the link sent to the customer: progress, the quote, and approve / decline. No login. */
export function CustomerPage() {
  const token = useParams().token ?? ''
  const job = useQuery({
    queryKey: ['public-job', token],
    queryFn: () => api.publicJob(token),
    refetchInterval: 30_000,
    retry: (count, e) => !(e instanceof ApiError && e.status === 404) && count < 2,
  })
  return (
    <div className="min-h-screen bg-slate-100">
      <title>Your car – kadkerja</title>
      <meta name="robots" content="noindex" />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-6">
        {job.isPending ? (
          <p className="text-slate-700">Loading…</p>
        ) : job.isError ? (
          <ErrorNote>
            {job.error instanceof ApiError && job.error.status === 404
              ? 'This link is not valid or has expired. Please ask the workshop for a new link.'
              : job.error.message}
          </ErrorNote>
        ) : (
          <Progress job={job.data} token={token} />
        )}
      </main>
    </div>
  )
}

function Progress({ job, token }: { job: PublicJob; token: string }) {
  const step = STEP_OF[job.status]
  return (
    <>
      <header>
        <p className="text-sm font-semibold text-teal-800">{job.workshop}</p>
        <h1 className="text-2xl font-bold text-slate-900">{HEADLINE[job.status]}</h1>
      </header>
      <section aria-label="Your car" className="rounded-lg bg-white p-4 shadow-sm">
        <p className="font-mono text-xl font-bold tracking-wide text-slate-900">{job.plate}</p>
        <p className="text-sm text-slate-700">
          {job.vehicle} · job {job.number}
        </p>
        <p className="mt-2 text-sm text-slate-800">
          <span className="text-slate-600">You told us: </span>
          {job.complaint}
        </p>
        {step >= 0 && (
          <ol aria-label="Progress" className="mt-4 grid grid-cols-6 gap-1">
            {STEPS.map((label, i) => (
              <li key={label} className="flex min-w-0 flex-col gap-1 break-words" aria-current={i === step ? 'step' : undefined}>
                <span className={`h-2 rounded-full ${i <= step ? 'bg-teal-700' : 'bg-slate-200'}`} />
                <span className={`text-[11px] leading-tight ${i === step ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
                  {label}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
      {job.quoteVisible && <QuoteCard job={job} token={token} />}
      <section aria-labelledby="history-title" className="rounded-lg bg-white p-4 shadow-sm">
        <h2 id="history-title" className="mb-2 font-semibold text-slate-900">
          History
        </h2>
        <ol className="flex flex-col gap-1.5 border-l-2 border-teal-700 pl-4">
          {[...job.timeline].reverse().map((s, i) => (
            <li key={i} className="text-sm">
              <span className="font-medium text-slate-900">{STEP_LABEL[s.status]}</span>
              {s.by === 'CUSTOMER' && <span className="text-slate-700"> (by you)</span>}
              <span className="ml-2 text-slate-600">{when(s.at)}</span>
            </li>
          ))}
        </ol>
      </section>
      <p className="text-center text-xs text-slate-600">Updates every 30 seconds. Keep this link private.</p>
    </>
  )
}

function QuoteCard({ job, token }: { job: PublicJob; token: string }) {
  const client = useQueryClient()
  // The decision being confirmed and the quote version on screen when the customer tapped it. If the page
  // refreshes with a newer quote meanwhile, the confirmation closes rather than answering a quote not read.
  const [pending, setPending] = useState<{ decision: Decision; version: number } | null>(null)
  const confirming = pending && pending.version === job.quoteVersion ? pending.decision : null
  const setConfirming = (d: Decision | null) => setPending(d ? { decision: d, version: job.quoteVersion } : null)
  const [reason, setReason] = useState('')
  const answer = useMutation({
    mutationFn: (d: Decision) =>
      api.answer(token, d, pending?.version ?? job.quoteVersion, d === 'DECLINE' ? reason.trim() : undefined),
    onSuccess: (saved) => {
      setConfirming(null)
      client.setQueryData(['public-job', token], saved)
    },
    // The quote changed or was already answered: show the message and the current state.
    onError: (e) => {
      setConfirming(null)
      if (e instanceof ApiError && e.status === 409) void client.invalidateQueries({ queryKey: ['public-job', token] })
    },
  })
  return (
    <section aria-labelledby="quote-title" className="rounded-lg bg-white p-4 shadow-sm">
      <h2 id="quote-title" className="mb-2 font-semibold text-slate-900">
        Quote <span className="text-sm font-normal text-slate-600">(version {job.quoteVersion})</span>
      </h2>
      <ul className="divide-y divide-slate-100 text-sm">
        {job.lines.map((l, i) => (
          <li key={i} className="flex justify-between gap-3 py-2">
            <span className="text-slate-900">
              {l.description}
              <span className="block text-xs text-slate-600">
                {l.kind === 'PART' ? 'Part' : 'Labour'} · {l.quantity} × {formatRm(l.unitPriceSen)}
                {l.taxable ? '' : ' · no SST'}
              </span>
            </span>
            <span className="tabular-nums text-slate-900">{formatRm(l.subtotalSen)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 border-t border-slate-200 pt-2 text-sm">
        <dt className="text-slate-700">Subtotal</dt>
        <dd className="text-right tabular-nums text-slate-900">{formatRm(job.subtotalSen)}</dd>
        <dt className="text-slate-700">SST {job.sstRatePercent}%</dt>
        <dd className="text-right tabular-nums text-slate-900">{formatRm(job.taxSen)}</dd>
        <dt className="font-semibold text-slate-900">Total</dt>
        <dd data-testid="public-total" className="text-right text-lg font-bold tabular-nums text-slate-900">
          {formatRm(job.totalSen)}
        </dd>
      </dl>
      {answer.isError && (
        <div className="mt-3">
          <ErrorNote>{answer.error.message}</ErrorNote>
        </div>
      )}
      {job.canAnswer && (
        <div className="mt-4 flex flex-col gap-2">
          {confirming === null && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={buttonClass} onClick={() => setConfirming('APPROVE')}>
                Approve
              </button>
              <button type="button" className={secondaryButtonClass} onClick={() => setConfirming('DECLINE')}>
                Decline
              </button>
            </div>
          )}
          {confirming === 'APPROVE' && (
            <div role="group" aria-label="Confirm approval" className="flex flex-col gap-2 rounded-md bg-teal-50 p-3">
              <p className="text-sm text-slate-900">
                Approve {formatRm(job.totalSen)} for the {job.lines.length} item{job.lines.length === 1 ? '' : 's'} above? The
                workshop will start the repair.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={buttonClass} disabled={answer.isPending} onClick={() => answer.mutate('APPROVE')}>
                  Yes, approve
                </button>
                <button type="button" className={secondaryButtonClass} onClick={() => setConfirming(null)}>
                  Back
                </button>
              </div>
            </div>
          )}
          {confirming === 'DECLINE' && (
            <div role="group" aria-label="Confirm decline" className="flex flex-col gap-2 rounded-md bg-rose-50 p-3">
              <label htmlFor="reason" className="text-sm font-medium text-slate-900">
                Reason (optional)
              </label>
              <textarea
                id="reason"
                maxLength={300}
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={inputClass}
              />
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={buttonClass} disabled={answer.isPending} onClick={() => answer.mutate('DECLINE')}>
                  Yes, decline
                </button>
                <button type="button" className={secondaryButtonClass} onClick={() => setConfirming(null)}>
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
