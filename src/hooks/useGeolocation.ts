import { useCallback, useEffect, useRef, useState } from 'react'
import { IASI_CENTER } from '../data/iasi'
import type { BrowserFix } from '../services/api'
import type { LatLng } from '../types'

export type GeoStatus = 'pending' | 'gps' | 'fallback'

const hasGeo = () => typeof navigator !== 'undefined' && 'geolocation' in navigator

/** Backend-ul acceptă doar locații mai noi de 2 minute; reîmprospătăm înainte de acest prag. */
const MAX_FIX_AGE = 90_000

/** Locația curentă a utilizatorului; revine la centrul Iașului dacă GPS-ul nu e disponibil. */
export function useGeolocation() {
  const [position, setPosition] = useState<LatLng>(IASI_CENTER)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [status, setStatus] = useState<GeoStatus>(() => (hasGeo() ? 'pending' : 'fallback'))
  const fix = useRef<BrowserFix | null>(null)

  const request = useCallback(
    () =>
      new Promise<BrowserFix | null>((resolve) => {
        if (!hasGeo()) return resolve(null)
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const next = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              timestamp: pos.timestamp,
            }
            fix.current = next
            setPosition({ lat: next.lat, lng: next.lng })
            setAccuracy(next.accuracy)
            setStatus('gps')
            resolve(next)
          },
          () => {
            setStatus('fallback')
            resolve(null)
          },
          { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
        )
      }),
    [],
  )

  useEffect(() => {
    request()
  }, [request])

  const locate = useCallback(() => {
    if (!hasGeo()) return
    setStatus('pending')
    request()
  }, [request])

  /** Locația GPS reală, suficient de recentă pentru o raportare (sau `null` fără acces la GPS). */
  const freshFix = useCallback(async () => {
    const f = fix.current
    if (f && Date.now() - f.timestamp < MAX_FIX_AGE) return f
    return request()
  }, [request])

  return { position, accuracy, status, locate, freshFix }
}
