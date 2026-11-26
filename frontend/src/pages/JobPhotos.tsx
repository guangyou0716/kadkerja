import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { api, ApiError, type JobCard, type Photo, type PhotoStage } from '../api'
import { buttonClass, ErrorNote, Field, inputClass } from '../components'
import { PhotoImage } from '../PhotoImage'
import { PhotoViewer } from '../PhotoViewer'
import { errorText } from '../errors'
import { useI18n } from '../i18n/context'
import { ACCEPTED, MAX_PHOTOS, MAX_UPLOAD_BYTES, photoProblem, shrinkPhoto } from '../photo'
/** As on the server: after photos once the repair has started. */
const afterAllowed = (job: JobCard) => job.status === 'IN_PROGRESS' || job.status === 'READY'
const finished = (job: JobCard) => job.next.length === 0

/** Before/after photos of the job. The customer sees them on their link too. */
export function JobPhotos({ job, canEdit }: { job: JobCard; canEdit: boolean }) {
  const { t, when } = useI18n()
  const photos = useQuery({ queryKey: ['photos', job.id], queryFn: () => api.photos(job.id) })
  const [open, setOpen] = useState<Photo | null>(null)
  const client = useQueryClient()
  const remove = useMutation({
    mutationFn: (p: Photo) => api.removePhoto(job.id, p.id),
    onSuccess: () => {
      setOpen(null)
      void client.invalidateQueries({ queryKey: ['photos', job.id] })
    },
  })
  const editable = canEdit && !finished(job)
  const list = photos.data ?? []
  return (
    <section aria-labelledby="photos-title" className="rounded-lg bg-white p-4 shadow-sm lg:col-span-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="photos-title" className="font-semibold text-slate-900">
          {t('photos.title')}
        </h2>
        <p className="text-xs text-slate-600">
          {t('photos.count', { count: list.length, max: MAX_PHOTOS })}
        </p>
      </div>
      {photos.isError && <ErrorNote>{errorText(photos.error, t)}</ErrorNote>}
      {photos.isPending ? (
        <p className="text-sm text-slate-700">{t('photos.loading')}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(['BEFORE', 'AFTER'] as const).map((stage) => {
            const group = list.filter((p) => p.stage === stage)
            return (
              <div key={stage}>
                <h3 className="mb-1 text-sm font-medium text-slate-800">{t(`photos.stage.${stage}`)}</h3>
                {group.length === 0 ? (
                  <p className="text-sm text-slate-600">{t(`photos.none.${stage}`)}</p>
                ) : (
                  <ul className="grid grid-cols-3 gap-2" aria-label={t(`photos.list.${stage}`)}>
                    {group.map((p, i) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="block w-full overflow-hidden rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                          onClick={() => setOpen(p)}
                          aria-label={p.caption ? t(`photos.openCaption.${stage}`, { n: i + 1, caption: p.caption }) : t(`photos.open.${stage}`, { n: i + 1 })}
                        >
                          <PhotoImage url={api.photoUrl(job.id, p.id)} alt="" className="aspect-[4/3] w-full object-cover" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
      {editable && list.length < MAX_PHOTOS && <AddPhoto job={job} />}
      {editable && list.length >= MAX_PHOTOS && (
        <p className="mt-3 text-sm text-slate-700">{t('photos.full', { max: MAX_PHOTOS })}</p>
      )}
      {open && (
        <PhotoViewer
          url={api.photoUrl(job.id, open.id)}
          title={t(`photos.viewer.${open.stage}`)}
          caption={open.caption}
          onClose={() => setOpen(null)}
        >
          <p className="text-xs text-slate-600">
            {t('photos.addedBy', { name: open.by, at: when(open.at) })}
          </p>
          {remove.isError && <ErrorNote>{errorText(remove.error, t)}</ErrorNote>}
          {editable && (
            <div>
              <button
                type="button"
                className="rounded-md px-3 py-2 font-semibold text-rose-800 hover:bg-rose-50"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(t('photos.removeConfirm'))) remove.mutate(open)
                }}
              >
                {t('photos.remove')}
              </button>
            </div>
          )}
        </PhotoViewer>
      )}
    </section>
  )
}

function AddPhoto({ job }: { job: JobCard }) {
  const { t } = useI18n()
  const client = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<PhotoStage>(afterAllowed(job) ? 'AFTER' : 'BEFORE')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const add = useMutation({
    mutationFn: ({ file, caption }: { file: Blob; caption: string }) => api.addPhoto(job.id, stage, file, caption),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['photos', job.id] }),
    onError: (e) => setErrors(e instanceof ApiError ? e.fields : {}),
  })
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const picked = fileInput.current?.files?.[0]
    const caption = String(new FormData(form).get('caption') ?? '')
    if (!picked) return setErrors({ file: t('photos.choose') })
    const problem = photoProblem(picked)
    if (problem) return setErrors({ file: t(problem) })
    if (caption.length > 200) return setErrors({ caption: t('photos.captionTooLong') })
    setErrors({})
    setBusy(true)
    try {
      const small = await shrinkPhoto(picked)
      if (small.size > MAX_UPLOAD_BYTES) return setErrors({ file: t('photos.tooBig') })
      await add.mutateAsync({ file: small, caption }).then(() => form.reset(), () => undefined)
    } finally {
      setBusy(false)
    }
  }
  const after = afterAllowed(job)
  return (
    <form onSubmit={submit} noValidate aria-label={t('photos.form')} className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-6">
      {add.isError && Object.keys(errors).length === 0 && (
        <div className="sm:col-span-6">
          <ErrorNote>{errorText(add.error, t)}</ErrorNote>
        </div>
      )}
      <fieldset className="flex flex-col gap-1 sm:col-span-2">
        <legend className="text-sm font-medium text-slate-800">{t('photos.of')}</legend>
        <label className="flex items-center gap-2 text-sm text-slate-900">
          <input type="radio" name="stage" value="BEFORE" checked={stage === 'BEFORE'} onChange={() => setStage('BEFORE')} className="size-4 accent-teal-700" />
          {t('photos.beforeRepair')}
        </label>
        <label className={`flex items-center gap-2 text-sm ${after ? 'text-slate-900' : 'text-slate-500'}`}>
          <input type="radio" name="stage" value="AFTER" checked={stage === 'AFTER'} disabled={!after} onChange={() => setStage('AFTER')} className="size-4 accent-teal-700" />
          {t(after ? 'photos.afterRepair' : 'photos.afterLater')}
        </label>
      </fieldset>
      <div className="sm:col-span-2">
        <Field label={t('photos.photo')} error={errors.file} hint={t('photos.photoHint')}>
          {(p) => <input {...p} ref={fileInput} name="file" type="file" accept={ACCEPTED.join(',')} className="text-sm text-slate-900 file:mr-2 file:rounded-md file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:font-semibold file:text-teal-900" />}
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label={t('photos.caption')} error={errors.caption}>
          {(p) => <input {...p} name="caption" maxLength={200} className={inputClass} />}
        </Field>
      </div>
      <div className="sm:col-span-6 sm:text-right">
        <button type="submit" className={buttonClass} disabled={busy || add.isPending}>
          {busy || add.isPending ? t('photos.uploading') : t('photos.add')}
        </button>
      </div>
    </form>
  )
}
