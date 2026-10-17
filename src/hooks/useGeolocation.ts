import { useCallback, useEffect, useState } from 'react'
import { IASI_CENTER } from '../data/mockData'
import type { LatLng } from '../types'

export type GeoStatus = 'pending' | 'gps' | 'fallback'

const hasGeo = () => typeof navigator !== 'undefined' && 'geolocation' in navigator

/** Locația curentă a utilizatorului; revine la centrul Iașului dacă GPS-ul nu e disponibil. */
export function useGeolocation() {
  const [position, setPosition] = useState<LatLng>(IASI_CENTER)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [status, setStatus] = useState<GeoStatus>(() => (hasGeo() ? 'pending' : 'fallback'))

  const request = useCallback(() => {
    if (!hasGeo()) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setAccuracy(pos.coords.accuracy)
        setStatus('gps')
      },
      () => setStatus('fallback'),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    )
  }, [])

  useEffect(request, [request])

  const locate = useCallback(() => {
    if (!hasGeo()) return
    setStatus('pending')
    request()
  }, [request])

  return { position, accuracy, status, locate }
}
