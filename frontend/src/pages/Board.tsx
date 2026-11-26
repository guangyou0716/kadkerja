import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api, type JobSummary } from '../api'
import { ErrorNote, StatusBadge } from '../components'
import { errorText } from '../errors'
import { useI18n } from '../i18n/context'
import { BOARD_COLUMNS } from '../status'

/** Open job cards in columns by where they are in the workshop. */
export function Board() {
  const { t } = useI18n()
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: api.jobs })
  if (jobs.isPending) return <p className="text-slate-700">{t('board.loading')}</p>
  if (jobs.isError) return <ErrorNote>{errorText(jobs.error, t)}</ErrorNote>
  const open = jobs.data.filter((j) => j.status !== 'COLLECTED' && j.status !== 'CANCELLED')
  const done = jobs.data.length - open.length
  return (
    <section aria-labelledby="board-title">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 id="board-title" className="text-2xl font-bold text-slate-900">
          {t('board.title')}
        </h1>
        <p className="text-sm text-slate-700">
          {t('board.counts', { open: open.length, done })}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {BOARD_COLUMNS.map((col) => {
          const cards = open.filter((j) => col.statuses.includes(j.status))
          return (
            <section key={col.title} aria-label={t(col.title)} className="rounded-lg bg-slate-100 p-3">
              <h2 className="mb-2 flex justify-between text-sm font-semibold text-slate-800">
                {t(col.title)} <span aria-label={t('board.jobs', { count: cards.length })}>{cards.length}</span>
              </h2>
              {cards.length === 0 ? (
                <p className="text-sm text-slate-600">{t('board.empty')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {cards.map((j) => (
                    <JobTile key={j.id} job={j} />
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </section>
  )
}

/** One job on the board or in "My jobs". */
export function JobTile({ job }: { job: JobSummary }) {
  const { t } = useI18n()
  return (
    <li>
      <Link
        to={`/jobs/${job.id}`}
        className="block rounded-md border border-slate-200 bg-white p-3 shadow-sm hover:border-teal-600 focus-visible:outline-2 focus-visible:outline-teal-700"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-base font-bold tracking-wide text-slate-900">{job.plate}</span>
          <StatusBadge status={job.status} />
        </div>
        <p className="text-sm text-slate-700">
          {job.vehicle} · {job.customer}
        </p>
        <p className="mt-1 line-clamp-2 text-sm text-slate-800">{job.complaint}</p>
        <p className="mt-1 flex justify-between gap-2 text-xs text-slate-600">
          <span>{job.number}</span>
          <span>{job.assignedTo ? t('tile.tech', { name: job.assignedTo.name }) : t('tile.noTech')}</span>
        </p>
      </Link>
    </li>
  )
}
