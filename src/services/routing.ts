import type {
  LatLng,
  MapData,
  RouteCandidate,
  RouteResult,
  TravelProfile,
} from '../types'
import { aqiAt, haversine, perpendicularOffset, pointInPolygon } from '../utils/geo'

// Rutare: OSRM (routing.openstreetmap.de) generează trasee candidate, iar EcoPulse
// le evaluează local după expunerea la poluare și obstacolele de pe hartă.
// Backend-ul are `POST /routes/alternatives`, dar acesta cere un server Valhalla
// (`VALHALLA_BASE_URL`) și nu suportă profilul „mașină”, așa că nu este folosit încă.

const OSRM: Record<TravelProfile, string> = {
  foot: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
  bike: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving',
  car: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
}

type OsrmRoute = {
  distance: number
  duration: number
  geometry: { coordinates: [number, number][] }
}

async function fetchOsrm(
  profile: TravelProfile,
  points: LatLng[],
  alternatives: boolean,
  signal?: AbortSignal,
): Promise<OsrmRoute[]> {
  const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';')
  const params = new URLSearchParams({
    overview: 'full',
    geometries: 'geojson',
    alternatives: alternatives ? '3' : 'false',
    steps: 'false',
  })
  const res = await fetch(`${OSRM[profile]}/${coords}?${params}`, { signal })
  if (!res.ok) throw new Error(`Rutare indisponibilă (${res.status})`)
  const data = await res.json()
  if (data.code !== 'Ok') throw new Error(data.message || 'Nu s-a găsit niciun traseu')
  return data.routes
}

/** Puncte intermediare care forțează trasee alternative, inclusiv prin zonele cele mai curate. */
function viaCandidates(a: LatLng, b: LatLng, data: MapData): LatLng[] {
  const vias = [0.22, -0.22, 0.4, -0.4].map((f) => perpendicularOffset(a, b, f))
  const D = haversine(a, b)
  const clean: { p: LatLng; aqi: number }[] = []
  const steps = 14
  const half = { lat: (b.lat - a.lat) / 2, lng: (b.lng - a.lng) / 2 }
  for (let i = 1; i < steps; i++) {
    for (let j = -6; j <= 6; j++) {
      const t = i / steps
      const base = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }
      // segment paralel cu A→B, centrat în `base`, deplasat perpendicular cu j × 7% din D
      const p = perpendicularOffset(
        { lat: base.lat - half.lat, lng: base.lng - half.lng },
        { lat: base.lat + half.lat, lng: base.lng + half.lng },
        j * 0.07,
      )
      // ținem doar punctele dintr-o elipsă rezonabilă în jurul segmentului A→B
      if (haversine(a, p) + haversine(p, b) > D * 1.45) continue
      clean.push({ p, aqi: aqiAt(p, data.sensors) })
    }
  }
  clean.sort((x, y) => x.aqi - y.aqi)
  const picked: LatLng[] = []
  for (const c of clean) {
    if (picked.every((q) => haversine(q, c.p) > D * 0.25)) picked.push(c.p)
    if (picked.length === 2) break
  }
  return [...picked, ...vias]
}

function evaluate(route: OsrmRoute, data: MapData, id: string): RouteCandidate {
  const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number])
  let exposure = 0
  let weighted = 0
  let total = 0
  const hit = new Set<string>()

  for (let i = 1; i < coords.length; i++) {
    const p0 = { lat: coords[i - 1][0], lng: coords[i - 1][1] }
    const p1 = { lat: coords[i][0], lng: coords[i][1] }
    const seg = haversine(p0, p1)
    if (seg === 0) continue
    const mid = { lat: (p0.lat + p1.lat) / 2, lng: (p0.lng + p1.lng) / 2 }
    const aqi = aqiAt(mid, data.sensors)
    exposure += (aqi * seg) / 1000
    weighted += aqi * seg
    total += seg

    for (const h of data.hazards) if (!hit.has(h.id) && haversine(mid, h) < 45) hit.add(h.id)
    for (const z of data.constructionZones)
      if (!hit.has(z.id) && pointInPolygon(mid, z.polygon)) hit.add(z.id)
    for (const iss of data.issues)
      if (!hit.has(iss.id) && haversine(mid, iss) < iss.radius) hit.add(iss.id)
  }

  return {
    id,
    coords,
    distance: route.distance,
    duration: route.duration,
    avgAqi: total ? weighted / total : 0,
    exposure,
    obstacles: hit.size,
  }
}

const ecoCost = (c: RouteCandidate) => c.exposure * (1 + 0.3 * c.obstacles)

function isDuplicate(a: RouteCandidate, b: RouteCandidate) {
  return (
    Math.abs(a.distance - b.distance) / b.distance < 0.02 &&
    Math.abs(a.duration - b.duration) / b.duration < 0.02
  )
}

export async function computeRoutes(
  from: LatLng,
  to: LatLng,
  profile: TravelProfile,
  data: MapData,
  signal?: AbortSignal,
): Promise<RouteResult> {
  const requests = [
    fetchOsrm(profile, [from, to], true, signal),
    ...viaCandidates(from, to, data).map((via) => fetchOsrm(profile, [from, via, to], false, signal)),
  ]
  const settled = await Promise.allSettled(requests)
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  const routes = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  if (!routes.length) {
    const err = settled.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined
    throw err?.reason ?? new Error('Nu s-a găsit niciun traseu')
  }

  const fastestOsrm = Math.min(...routes.map((r) => r.duration))
  const candidates: RouteCandidate[] = []
  routes.forEach((r, i) => {
    // eliminăm ocolurile absurde
    if (r.duration > fastestOsrm * 1.6) return
    const c = evaluate(r, data, `r${i}`)
    if (!candidates.some((x) => isDuplicate(x, c))) candidates.push(c)
  })

  const minBy = (list: RouteCandidate[], f: (c: RouteCandidate) => number) =>
    list.reduce((best, c) => (f(c) < f(best) ? c : best))

  const fastest = minBy(candidates, (c) => c.duration)
  const cleanest = minBy(candidates, ecoCost)
  // Protecție la împărțirea la zero (trasee degenerate, fără segmente).
  const minDur = fastest.duration || 1
  const minEco = ecoCost(cleanest) || 1
  const balancedScore = (c: RouteCandidate) => 0.5 * (c.duration / minDur) + 0.5 * (ecoCost(c) / minEco)

  // Traseul echilibrat trebuie să fie un compromis real: mai curat decât cel rapid
  // și mai rapid decât cel curat. Altfel revenim la cel mai bun scor combinat.
  const between = candidates.filter(
    (c) =>
      c !== fastest &&
      c !== cleanest &&
      c.duration <= cleanest.duration &&
      ecoCost(c) <= ecoCost(fastest),
  )
  const balanced = between.length ? minBy(between, balancedScore) : minBy(candidates, balancedScore)

  return { fastest, cleanest, balanced }
}

// ---------------------------------------------------------------- Google Maps

const GMAPS_MODE: Record<TravelProfile, string> = {
  foot: 'walking',
  bike: 'bicycling',
  car: 'driving',
}

/** Construiește un link Google Maps cu puncte intermediare care păstrează forma traseului. */
export function googleMapsUrl(route: RouteCandidate, profile: TravelProfile): string {
  const c = route.coords
  const fmt = ([lat, lng]: [number, number]) => `${lat.toFixed(6)},${lng.toFixed(6)}`
  const waypoints = [0.25, 0.5, 0.75].map((t) => c[Math.round((c.length - 1) * t)])
  const params = new URLSearchParams({
    api: '1',
    origin: fmt(c[0]),
    destination: fmt(c[c.length - 1]),
    waypoints: waypoints.map(fmt).join('|'),
    travelmode: GMAPS_MODE[profile],
  })
  return `https://www.google.com/maps/dir/?${params}`
}

export function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
}

export function openInGoogleMaps(route: RouteCandidate, profile: TravelProfile) {
  const url = googleMapsUrl(route, profile)
  // Pe mobil, link-ul universal deschide aplicația Google Maps (dacă e instalată).
  if (isMobileDevice()) window.location.href = url
  else window.open(url, '_blank', 'noopener')
}
