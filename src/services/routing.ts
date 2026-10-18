import type { RouteCandidate, RouteMode, RoutePlace, RouteResult, TravelProfile } from '../types'
import { API_URL } from './api'

/** Route candidates are generated and scored by EcoPulse backend against the current map context. */
type EcoRouteResponse = {
  routes: Record<RouteMode, {
    id: string
    coordinates: [number, number][]
    distance_m: number
    duration_s: number
    avg_aqi: number
    exposure: number
    obstacles: number
    traffic: { avg_congestion: number; congested_m: number; worst_level: string | null }
    google_maps_url: string
  }>
  warnings: string[]
  traffic: { source: string; demand_source: string; roads: number; affects_duration: boolean }
  data: { sensors: number; construction_zones: number; issues: number }
  attribution: string
}

const PROFILES: Record<TravelProfile, string> = { foot: 'foot', bike: 'bike', car: 'car' }
const MODES: RouteMode[] = ['fastest', 'cleanest', 'balanced']

export async function computeRoutes(
  from: RoutePlace,
  to: RoutePlace,
  profile: TravelProfile,
  signal?: AbortSignal,
): Promise<RouteResult> {
  const response = await fetch(`${API_URL}/routes/eco`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      origin: { latitude: from.lat, longitude: from.lng },
      destination: { latitude: to.lat, longitude: to.lng },
      profile: PROFILES[profile],
      departure_at: new Date().toISOString(),
    }),
    signal,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = payload?.code ?? payload?.detail
    throw new Error(typeof detail === 'string' ? `Rutarea backend nu este disponibilă: ${detail}` : 'Rutarea backend nu este disponibilă.')
  }

  const result = payload as EcoRouteResponse
  if (!result.routes || MODES.some((mode) => !result.routes[mode])) {
    throw new Error('Backend-ul nu a returnat toate cele trei variante de traseu.')
  }
  return Object.fromEntries(MODES.map((mode) => {
    const route = result.routes[mode]
    const candidate: RouteCandidate = {
      id: route.id,
      coords: route.coordinates,
      distance: route.distance_m,
      duration: route.duration_s,
      avgAqi: route.avg_aqi,
      exposure: route.exposure,
      obstacles: route.obstacles,
      traffic: route.traffic,
      googleMapsUrl: route.google_maps_url,
    }
    return [mode, candidate]
  })) as RouteResult
}

export function openInGoogleMaps(route: RouteCandidate, profile: TravelProfile) {
  const mode = profile === 'foot' ? 'walking' : profile === 'bike' ? 'bicycling' : 'driving'
  const origin = route.coords[0].join(',')
  const destination = route.coords.at(-1)?.join(',')
  const url = route.googleMapsUrl || `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=${mode}`
  window.open(url, '_blank', 'noopener,noreferrer')
}
