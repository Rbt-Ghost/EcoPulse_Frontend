import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../services/api'
import type { AirQuality } from '../types'

/** Cât de des cerem din nou datele; backend-ul le păstrează tot 10 minute în cache. */
const REFRESH_MS = 10 * 60_000

type State = { data: AirQuality | null; error: string | null; loading: boolean }

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 503) return 'Serviciul de prognoză CAMS nu răspunde momentan.'
    if (e.status === 404) return 'Serverul EcoPulse nu oferă încă prognoza calității aerului (repornește backend-ul).'
    return `Nu am putut încărca prognoza calității aerului (eroare ${e.status}).`
  }
  return 'Nu am putut contacta serverul EcoPulse pentru prognoza calității aerului.'
}

/**
 * Calitatea aerului în Iași, reîmprospătată la 10 minute cât timp pagina e vizibilă.
 * `onAlert` e apelat o singură dată pe episod, când PM2.5 ajunge la „Moderat” sau mai rău.
 */
export function useAirQuality(onAlert?: (data: AirQuality) => void) {
  const [state, setState] = useState<State>({ data: null, error: null, loading: true })
  const alerted = useRef(false)
  const latest = useRef(0)
  const onAlertRef = useRef(onAlert)
  useEffect(() => {
    onAlertRef.current = onAlert
  }, [onAlert])

  const fetchNow = useCallback(async () => {
    // Un răspuns întârziat nu are voie să suprascrie unul mai nou.
    const id = ++latest.current
    try {
      const data = await api.getAirQuality()
      if (id !== latest.current) return
      setState({ data, error: null, loading: false })
      if (data.alert && !alerted.current) onAlertRef.current?.(data)
      alerted.current = data.alert
    } catch (e) {
      if (id !== latest.current) return
      // Păstrăm ultimele date bune; doar semnalăm eroarea.
      setState((s) => ({
        ...s,
        loading: false,
        error: errorMessage(e),
      }))
    }
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    const tick = () => {
      if (document.visibilityState === 'visible') fetchNow()
    }
    fetchNow()
    timer = setInterval(tick, REFRESH_MS)
    // La revenirea în tab datele pot fi vechi: le cerem imediat dacă a trecut intervalul.
    let hiddenAt = 0
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now()
      else if (hiddenAt && Date.now() - hiddenAt >= REFRESH_MS) {
        clearInterval(timer)
        fetchNow()
        timer = setInterval(tick, REFRESH_MS)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [fetchNow])

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }))
    fetchNow()
  }, [fetchNow])

  return { ...state, reload }
}
