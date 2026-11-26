import type { JobCard } from './api'
import { translate, type Lang } from './i18n/core'
import { formatRm } from './money'

/** The customer's progress page for this job on this site; with [lang] it opens in that language. */
export function customerLink(origin: string, token: string, lang?: Lang): string {
  return `${origin}/t/${token}${lang ? `?lang=${lang}` : ''}`
}

/** The message staff send with the link, in [lang]; what it says depends on where the job is. */
export function whatsappText(job: JobCard, link: string, lang: Lang = 'en'): string {
  const hi = translate(lang, 'wa.hi', { name: job.customer.name.split(' ')[0] })
  const car = `${job.vehicle.plate} (${job.number})`
  switch (job.status) {
    case 'QUOTED':
      return translate(lang, 'wa.quoted', { hi, car, total: formatRm(job.totalSen), link })
    case 'READY':
      return translate(lang, 'wa.ready', { hi, car, link })
    default:
      return translate(lang, 'wa.progress', { hi, car, link })
  }
}

/** wa.me link for a Malaysian number ("012-345 6789" -> 60123456789) with the message filled in. */
export function whatsappUrl(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, '')
  const intl = digits.startsWith('0') ? `60${digits.slice(1)}` : digits
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`
}
