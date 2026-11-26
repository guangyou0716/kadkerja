import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import { api, ApiError, type JobCard, type Photo, type PhotoStage } from '../api'
import { buttonClass, ErrorNote, Field, inputClass } from '../components'
import { PhotoImage } from '../PhotoImage'
import { PhotoViewer } from '../PhotoViewer'
import { ACCEPTED, MAX_PHOTOS, MAX_UPLOAD_BYTES, photoProblem, shrinkPhoto } from '../photo'

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

const STAGE_LABEL: Record<PhotoStage, string> = { BEFORE: 'Before', AFTER: 'After' }
/** As on the server: after photos once the repair has started. */
const afterAllowed = (job: JobCard) => job.status === 'IN_PROGRESS' || job.status === 'READY'
const finished = (job: JobCard) => job.next.length === 0

/** Before/after photos of the job. The customer sees them on their link too. */
export function JobPhotos({ job, canEdit }: { job: JobCard; canEdit: boolean }) {
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
          Photos
        </h2>
        <p className="text-xs text-slate-600">
          {list.length} of {MAX_PHOTOS} · the customer sees these on their link
        </p>
      </div>
      {photos.isError && <ErrorNote>{photos.error.message}</ErrorNote>}
      {photos.isPending ? (
        <p className="text-sm text-slate-700">Loading photos…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {(['BEFORE', 'AFTER'] as const).map((stage) => {
            const group = list.filter((p) => p.stage === stage)
            return (
              <div key={stage}>
                <h3 className="mb-1 text-sm font-medium text-slate-800">{STAGE_LABEL[stage]}</h3>
                {group.length === 0 ? (
                  <p className="text-sm text-slate-600">No {STAGE_LABEL[stage].toLowerCase()} photos yet.</p>
                ) : (
                  <ul className="grid grid-cols-3 gap-2" aria-label={`${STAGE_LABEL[stage]} photos`}>
                    {group.map((p, i) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="block w-full overflow-hidden rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                          onClick={() => setOpen(p)}
                          aria-label={`Open ${STAGE_LABEL[stage].toLowerCase()} photo ${i + 1}${p.caption ? `: ${p.caption}` : ''}`}
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
        <p className="mt-3 text-sm text-slate-700">This job card has {MAX_PHOTOS} photos. Remove one to add another.</p>
      )}
      {open && (
        <PhotoViewer
          url={api.photoUrl(job.id, open.id)}
          title={`${STAGE_LABEL[open.stage]} photo`}
          caption={open.caption}
          onClose={() => setOpen(null)}
        >
          <p className="text-xs text-slate-600">
            Added by {open.by}, {when(open.at)}
          </p>
          {remove.isError && <ErrorNote>{remove.error.message}</ErrorNote>}
          {editable && (
            <div>
              <button
                type="button"
                className="rounded-md px-3 py-2 font-semibold text-rose-800 hover:bg-rose-50"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm('Remove this photo? The customer will no longer see it.')) remove.mutate(open)
                }}
              >
                Remove photo
              </button>
            </div>
          )}
        </PhotoViewer>
      )}
    </section>
  )
}

function AddPhoto({ job }: { job: JobCard }) {
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
    if (!picked) return setErrors({ file: 'Choose a photo.' })
    const problem = photoProblem(picked)
    if (problem) return setErrors({ file: problem })
    if (caption.length > 200) return setErrors({ caption: 'At most 200 characters.' })
    setErrors({})
    setBusy(true)
    try {
      const small = await shrinkPhoto(picked)
      if (small.size > MAX_UPLOAD_BYTES) return setErrors({ file: 'This photo is too big (at most 4 MB).' })
      await add.mutateAsync({ file: small, caption }).then(() => form.reset(), () => undefined)
    } finally {
      setBusy(false)
    }
  }
  const after = afterAllowed(job)
  return (
    <form onSubmit={submit} noValidate aria-label="Add a photo" className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-6">
      {add.isError && Object.keys(errors).length === 0 && (
        <div className="sm:col-span-6">
          <ErrorNote>{add.error.message}</ErrorNote>
        </div>
      )}
      <fieldset className="flex flex-col gap-1 sm:col-span-2">
        <legend className="text-sm font-medium text-slate-800">Photo of</legend>
        <label className="flex items-center gap-2 text-sm text-slate-900">
          <input type="radio" name="stage" value="BEFORE" checked={stage === 'BEFORE'} onChange={() => setStage('BEFORE')} className="size-4 accent-teal-700" />
          Before the repair
        </label>
        <label className={`flex items-center gap-2 text-sm ${after ? 'text-slate-900' : 'text-slate-500'}`}>
          <input type="radio" name="stage" value="AFTER" checked={stage === 'AFTER'} disabled={!after} onChange={() => setStage('AFTER')} className="size-4 accent-teal-700" />
          After the repair{!after && ' (once the repair has started)'}
        </label>
      </fieldset>
      <div className="sm:col-span-2">
        <Field label="Photo" error={errors.file} hint="JPEG or PNG. Made smaller before sending.">
          {(p) => <input {...p} ref={fileInput} name="file" type="file" accept={ACCEPTED.join(',')} className="text-sm text-slate-900 file:mr-2 file:rounded-md file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:font-semibold file:text-teal-900" />}
        </Field>
      </div>
      <div className="sm:col-span-2">
        <Field label="Caption (optional)" error={errors.caption}>
          {(p) => <input {...p} name="caption" maxLength={200} className={inputClass} />}
        </Field>
      </div>
      <div className="sm:col-span-6 sm:text-right">
        <button type="submit" className={buttonClass} disabled={busy || add.isPending}>
          {busy || add.isPending ? 'Uploading…' : 'Add photo'}
        </button>
      </div>
    </form>
  )
}
