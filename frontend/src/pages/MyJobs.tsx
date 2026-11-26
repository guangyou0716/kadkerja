import { useQuery } from '@tanstack/react-query'
import { api, type JobSummary } from '../api'
import { ErrorNote } from '../components'
import { errorText } from '../errors'
import { useI18n } from '../i18n/context'
import type { JobStatus } from '../status'
import { JobTile } from './Board'

/** Finish what is started before starting something new. */
const TO_DO: JobStatus[] = ['IN_PROGRESS', 'APPROVED', 'INSPECTING', 'RECEIVED']
/** Nothing for the technician to do until the customer or the advisor acts. */
const WAITING: JobStatus[] = ['QUOTED', 'DECLINED', 'READY']

const pick = (jobs: JobSummary[], order: JobStatus[]) =>
  jobs
    .filter((j) => order.includes(j.status))
    .sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.id - b.id)

/** A technician's own cars: what to work on now, and what is waiting on someone else. */
export function MyJobs() {
  const { t } = useI18n()
  const jobs = useQuery({ queryKey: ['jobs', 'mine'], queryFn: api.myJobs })
  if (jobs.isPending) return <p className="text-slate-700">{t('mine.loading')}</p>
  if (jobs.isError) return <ErrorNote>{errorText(jobs.error, t)}</ErrorNote>
  const todo = pick(jobs.data, TO_DO)
  const waiting = pick(jobs.data, WAITING)
  const done = jobs.data.length - todo.length - waiting.length
  return (
    <section aria-labelledby="mine-title" className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 id="mine-title" className="text-2xl font-bold text-slate-900">
          {t('mine.title')}
        </h1>
        <p className="text-sm text-slate-700">
          {t('mine.counts', { todo: todo.length, waiting: waiting.length, done })}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <List title={t('mine.todo')} jobs={todo} empty={t('mine.todoEmpty')} />
        <List title={t('mine.waiting')} jobs={waiting} empty={t('mine.waitingEmpty')} />
      </div>
    </section>
  )
}

function List({ title, jobs, empty }: { title: string; jobs: JobSummary[]; empty: string }) {
  const { t } = useI18n()
  return (
    <section aria-label={title} className="rounded-lg bg-slate-100 p-3">
      <h2 className="mb-2 flex justify-between text-sm font-semibold text-slate-800">
        {title} <span aria-label={t('board.jobs', { count: jobs.length })}>{jobs.length}</span>
      </h2>
      {jobs.length === 0 ? (
        <p className="text-sm text-slate-600">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {jobs.map((j) => (
            <JobTile key={j.id} job={j} />
          ))}
        </ul>
      )}
    </section>
  )
}
