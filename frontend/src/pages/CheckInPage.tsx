import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { api, ApiError, type CheckIn } from '../api'
import { buttonClass, ErrorNote, Field, inputClass } from '../components'
import { errorText } from '../errors'
import { useI18n } from '../i18n/context'

const optionalNumber = (v: FormDataEntryValue | null) => {
  const t = String(v ?? '').trim()
  return t === '' ? undefined : Number(t)
}

/** A car arrives: customer, car and complaint. */
export function CheckInPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const client = useQueryClient()
  const [fields, setFields] = useState<Record<string, string>>({})
  const checkIn = useMutation({
    mutationFn: api.checkIn,
    onSuccess: async (job) => {
      await client.invalidateQueries({ queryKey: ['jobs'] })
      navigate(`/jobs/${job.id}`)
    },
    onError: (e) => setFields(e instanceof ApiError ? e.fields : {}),
  })

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const body: CheckIn = {
      customerName: String(f.get('customerName') ?? ''),
      phone: String(f.get('phone') ?? '').trim(),
      plate: String(f.get('plate') ?? ''),
      make: String(f.get('make') ?? ''),
      model: String(f.get('model') ?? ''),
      year: optionalNumber(f.get('year')),
      mileageKm: optionalNumber(f.get('mileageKm')),
      complaint: String(f.get('complaint') ?? ''),
    }
    setFields({})
    checkIn.mutate(body)
  }

  return (
    <section aria-labelledby="checkin-title" className="max-w-2xl">
      <h1 id="checkin-title" className="mb-4 text-2xl font-bold text-slate-900">
        {t('checkIn.title')}
      </h1>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-lg bg-white p-4 shadow-sm">
        {checkIn.isError && <ErrorNote>{errorText(checkIn.error, t)}</ErrorNote>}
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 font-semibold text-slate-900">{t('checkIn.customer')}</legend>
          <Field label={t('checkIn.name')} error={fields.customerName}>
            {(p) => <input {...p} name="customerName" autoComplete="off" className={inputClass} required />}
          </Field>
          <Field label={t('checkIn.phone')} error={fields.phone} hint={t('checkIn.phoneHint')}>
            {(p) => <input {...p} name="phone" type="tel" inputMode="tel" className={inputClass} required />}
          </Field>
        </fieldset>
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 font-semibold text-slate-900">{t('checkIn.car')}</legend>
          <Field label={t('checkIn.plate')} error={fields.plate} hint={t('checkIn.plateHint')}>
            {(p) => <input {...p} name="plate" className={`${inputClass} font-mono uppercase`} required />}
          </Field>
          <Field label={t('checkIn.make')} error={fields.make}>
            {(p) => <input {...p} name="make" className={inputClass} required />}
          </Field>
          <Field label={t('checkIn.model')} error={fields.model}>
            {(p) => <input {...p} name="model" className={inputClass} required />}
          </Field>
          <Field label={t('checkIn.year')} error={fields.year}>
            {(p) => <input {...p} name="year" type="number" inputMode="numeric" className={inputClass} />}
          </Field>
          <Field label={t('checkIn.mileage')} error={fields.mileageKm}>
            {(p) => <input {...p} name="mileageKm" type="number" inputMode="numeric" className={inputClass} />}
          </Field>
        </fieldset>
        <Field label={t('checkIn.complaint')} error={fields.complaint}>
          {(p) => <textarea {...p} name="complaint" rows={3} className={inputClass} required />}
        </Field>
        <div>
          <button type="submit" className={buttonClass} disabled={checkIn.isPending}>
            {checkIn.isPending ? t('checkIn.busy') : t('checkIn.submit')}
          </button>
        </div>
      </form>
    </section>
  )
}
