import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { api } from './api'
import { useI18n } from './i18n/context'

/**
 * An image loaded through fetch (the session cookie and the browser demo both work that way) and
 * shown from an object URL that is released again when it is no longer on screen.
 */
export function PhotoImage({ url, alt, className }: { url: string; alt: string; className?: string }) {
  const { t } = useI18n()
  const blob = useQuery({ queryKey: ['image', url], queryFn: () => api.image(url), staleTime: Infinity, retry: false })
  const img = useRef<HTMLImageElement>(null)
  useEffect(() => {
    if (!blob.data || !img.current) return
    const made = URL.createObjectURL(blob.data)
    img.current.src = made
    return () => URL.revokeObjectURL(made)
  }, [blob.data])
  if (blob.isError) {
    return (
      <span role="img" aria-label={t('photo.notLoadedLabel', { name: alt || t('photo.fallbackName') })} className={`flex items-center justify-center bg-slate-100 text-xs text-slate-600 ${className ?? ''}`}>
        {t('photo.notLoaded')}
      </span>
    )
  }
  if (!blob.data) return <span aria-hidden="true" className={`block animate-pulse bg-slate-200 ${className ?? ''}`} />
  return <img ref={img} alt={alt} className={className} />
}
