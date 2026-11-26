import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router'
import { api, ApiError, type Decision, type PublicJob } from '../api'
import { buttonClass, ErrorNote, inputClass, secondaryButtonClass } from '../components'
import { formatRm } from '../money'
import { errorText } from '../errors'
import { useI18n } from '../i18n/context'
import type { MessageKey } from '../i18n/core'
import { LanguagePicker } from '../i18n/LanguagePicker'
import type { JobStatus } from '../status'
import { PhotoImage } from '../PhotoImage'
import { PhotoViewer } from '../PhotoViewer'

/** The progress bar's steps (APPROVED and IN_PROGRESS share "Repair"; a declined car skips it). */
const STEPS = [
  'customer.step.checkedIn',
  'customer.step.inspect',
  'customer.step.quote',
  'customer.step.repair',
  'customer.step.ready',
  'customer.step.collected',
] as const satisfies readonly MessageKey[]
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
  const { t } = useI18n()
  const token = useParams().token ?? ''
  const job = useQuery({
    queryKey: ['public-job', token],
    queryFn: () => api.publicJob(token),
    refetchInterval: 30_000,
    retry: (count, e) => !(e instanceof ApiError && e.status === 404) && count < 2,
  })
  return (
    <div className="min-h-screen bg-slate-100">
      <title>{t('customer.pageTitle')}</title>
      <meta name="robots" content="noindex" />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-6">
        <div className="flex justify-end">
          <LanguagePicker />
        </div>
        {job.isPending ? (
          <p className="text-slate-700">{t('common.loading')}</p>
        ) : job.isError ? (
          <ErrorNote>
            {job.error instanceof ApiError && job.error.status === 404 ? t('customer.invalid') : errorText(job.error, t)}
          </ErrorNote>
        ) : (
          <Progress job={job.data} token={token} />
        )}
      </main>
    </div>
  )
}

function Progress({ job, token }: { job: PublicJob; token: string }) {
  const { t, when } = useI18n()
  const step = STEP_OF[job.status]
  return (
    <>
      <header>
        <p className="text-sm font-semibold text-teal-800">{job.workshop}</p>
        <h1 className="text-2xl font-bold text-slate-900">{t(`customer.headline.${job.status}`)}</h1>
      </header>
      <section aria-label={t('customer.yourCar')} className="rounded-lg bg-white p-4 shadow-sm">
        <p className="font-mono text-xl font-bold tracking-wide text-slate-900">{job.plate}</p>
        <p className="text-sm text-slate-700">
          {t('customer.job', { vehicle: job.vehicle, number: job.number })}
        </p>
        <p className="mt-2 text-sm text-slate-800">
          <span className="text-slate-600">{t('customer.toldUs')} </span>
          {job.complaint}
        </p>
        {step >= 0 && (
          <ol aria-label={t('customer.progress')} className="mt-4 grid grid-cols-6 gap-1">
            {STEPS.map((key, i) => (
              <li key={key} className="flex min-w-0 flex-col gap-1 break-words" aria-current={i === step ? 'step' : undefined}>
                <span className={`h-2 rounded-full ${i <= step ? 'bg-teal-700' : 'bg-slate-200'}`} />
                <span className={`text-[11px] leading-tight ${i === step ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
                  {t(key)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
      {job.photos.length > 0 && <CustomerPhotos job={job} token={token} />}
      {job.quoteVisible && <QuoteCard job={job} token={token} />}
      <section aria-labelledby="history-title" className="rounded-lg bg-white p-4 shadow-sm">
        <h2 id="history-title" className="mb-2 font-semibold text-slate-900">
          {t('customer.history')}
        </h2>
        <ol className="flex flex-col gap-1.5 border-l-2 border-teal-700 pl-4">
          {[...job.timeline].reverse().map((s, i) => (
            <li key={i} className="text-sm">
              <span className="font-medium text-slate-900">{t(`customer.event.${s.status}`)}</span>
              {s.by === 'CUSTOMER' && <span className="text-slate-700"> {t('customer.byYou')}</span>}
              <span className="ml-2 text-slate-600">{when(s.at)}</span>
            </li>
          ))}
        </ol>
      </section>
      <p className="text-center text-xs text-slate-600">{t('customer.footer')}</p>
    </>
  )
}

function QuoteCard({ job, token }: { job: PublicJob; token: string }) {
  const { t } = useI18n()
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
        {t('quote.title')} <span className="text-sm font-normal text-slate-600">{t('customer.quoteVersion', { version: job.quoteVersion })}</span>
      </h2>
      <ul className="divide-y divide-slate-100 text-sm">
        {job.lines.map((l, i) => (
          <li key={i} className="flex justify-between gap-3 py-2">
            <span className="text-slate-900">
              {l.description}
              <span className="block text-xs text-slate-600">
                {t('customer.lineDetail', {
                  kind: t(l.kind === 'PART' ? 'quote.kind.PART' : 'quote.kind.LABOUR'),
                  qty: l.quantity,
                  price: formatRm(l.unitPriceSen),
                })}
                {l.taxable ? '' : t('customer.noSst')}
              </span>
            </span>
            <span className="tabular-nums text-slate-900">{formatRm(l.subtotalSen)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 border-t border-slate-200 pt-2 text-sm">
        <dt className="text-slate-700">{t('quote.subtotal')}</dt>
        <dd className="text-right tabular-nums text-slate-900">{formatRm(job.subtotalSen)}</dd>
        <dt className="text-slate-700">{t('quote.sst', { rate: job.sstRatePercent })}</dt>
        <dd className="text-right tabular-nums text-slate-900">{formatRm(job.taxSen)}</dd>
        <dt className="font-semibold text-slate-900">{t('quote.total')}</dt>
        <dd data-testid="public-total" className="text-right text-lg font-bold tabular-nums text-slate-900">
          {formatRm(job.totalSen)}
        </dd>
      </dl>
      {answer.isError && (
        <div className="mt-3">
          <ErrorNote>
            {answer.error instanceof ApiError && answer.error.status === 409 ? t('customer.changed') : errorText(answer.error, t)}
          </ErrorNote>
        </div>
      )}
      {job.canAnswer && (
        <div className="mt-4 flex flex-col gap-2">
          {confirming === null && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={buttonClass} onClick={() => setConfirming('APPROVE')}>
                {t('customer.approve')}
              </button>
              <button type="button" className={secondaryButtonClass} onClick={() => setConfirming('DECLINE')}>
                {t('customer.decline')}
              </button>
            </div>
          )}
          {confirming === 'APPROVE' && (
            <div role="group" aria-label={t('customer.confirmApproval')} className="flex flex-col gap-2 rounded-md bg-teal-50 p-3">
              <p className="text-sm text-slate-900">
                {t(job.lines.length === 1 ? 'customer.confirmApprove.one' : 'customer.confirmApprove.other', {
                  total: formatRm(job.totalSen),
                  count: job.lines.length,
                })}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={buttonClass} disabled={answer.isPending} onClick={() => answer.mutate('APPROVE')}>
                  {t('customer.yesApprove')}
                </button>
                <button type="button" className={secondaryButtonClass} onClick={() => setConfirming(null)}>
                  {t('common.back')}
                </button>
              </div>
            </div>
          )}
          {confirming === 'DECLINE' && (
            <div role="group" aria-label={t('customer.confirmDecline')} className="flex flex-col gap-2 rounded-md bg-rose-50 p-3">
              <label htmlFor="reason" className="text-sm font-medium text-slate-900">
                {t('customer.reason')}
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
                  {t('customer.yesDecline')}
                </button>
                <button type="button" className={secondaryButtonClass} onClick={() => setConfirming(null)}>
                  {t('common.back')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/** The workshop's before/after photos (fetched by their random key through this link). */
function CustomerPhotos({ job, token }: { job: PublicJob; token: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState<PublicJob['photos'][number] | null>(null)
  return (
    <section aria-labelledby="photos-title" className="rounded-lg bg-white p-4 shadow-sm">
      <h2 id="photos-title" className="mb-2 font-semibold text-slate-900">
        {t('customer.photos')}
      </h2>
      {(['BEFORE', 'AFTER'] as const).map((stage) => {
        const group = job.photos.filter((p) => p.stage === stage)
        if (group.length === 0) return null
        const label = t(stage === 'BEFORE' ? 'photos.beforeRepair' : 'photos.afterRepair')
        return (
          <div key={stage} className="mb-2">
            <h3 className="mb-1 text-sm font-medium text-slate-800">{label}</h3>
            <ul className="grid grid-cols-3 gap-2" aria-label={label}>
              {group.map((p, i) => (
                <li key={p.key}>
                  <button
                    type="button"
                    onClick={() => setOpen(p)}
                    className="block w-full overflow-hidden rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                    aria-label={p.caption ? t('customer.openPhotoCaption', { n: i + 1, caption: p.caption }) : t('customer.openPhoto', { n: i + 1 })}
                  >
                    <PhotoImage url={api.publicPhotoUrl(token, p.key)} alt="" className="aspect-[4/3] w-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      {open && (
        <PhotoViewer
          url={api.publicPhotoUrl(token, open.key)}
          title={t(open.stage === 'BEFORE' ? 'photos.beforeRepair' : 'photos.afterRepair')}
          caption={open.caption}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  )
}
