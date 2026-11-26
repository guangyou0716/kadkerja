import type { JobCard } from './api'
import { formatRm } from './money'

/** The customer's progress page for this job on this site. */
export function customerLink(origin: string, token: string): string {
  return `${origin}/t/${token}`
}

/** The message staff send with the link; what it says depends on where the job is. */
export function whatsappText(job: JobCard, link: string): string {
  const hi = `Hi ${job.customer.name.split(' ')[0]},`
  const car = `${job.vehicle.plate} (${job.number})`
  switch (job.status) {
    case 'QUOTED':
      return `${hi} the quote for ${car} is ready: ${formatRm(job.totalSen)} incl. SST. Please check it and tap Approve or Decline here: ${link}`
    case 'READY':
      return `${hi} ${car} is ready to collect. Details: ${link}`
    default:
      return `${hi} you can follow the progress of ${car} here: ${link}`
  }
}

/** wa.me link for a Malaysian number ("012-345 6789" -> 60123456789) with the message filled in. */
export function whatsappUrl(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, '')
  const intl = digits.startsWith('0') ? `60${digits.slice(1)}` : digits
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`
}
