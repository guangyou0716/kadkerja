import { ApiError, PHOTO_GONE } from './api'
import type { I18n } from './i18n/context'

/**
 * What to show for a failed request. Messages the app writes itself are in the chosen language; the server's own
 * explanations (rule refusals, field checks) arrive in English and are shown as they are.
 */
export function errorText(e: Error, t: I18n['t']): string {
  if (e instanceof ApiError) {
    if (e.status === 0) return t('error.network')
    if (e.status === 429) return t('error.tooMany')
    if (e.status === 404 && e.message === PHOTO_GONE) return t('error.photoGone')
  }
  return e.message
}

