import type {
  LatLng,
  MapData,
  RouteCandidate,
  RouteResult,
  Severity,
  IssueCategory,
  TrafficSegment,
  TravelProfile,
} from '../types'
import { aqiAt, haversine, perpendicularOffset, pointInPolygon, polygonCenter } from '../utils/geo'
import { TrafficIndex } from '../utils/traffic'

// Rutare: OSRM (routing.openstreetmap.de) generează trasee candidate, iar EcoPulse
// le evaluează local după expunerea la poluare, traficul estimat la ora plecării și obstacolele de pe hartă.
// Când OSRM nu răspunde, aceleași cereri merg la Valhalla (valhalla1.openstreetmap.de, tot OpenStreetMap).

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
  // Un server căzut nu răspunde deloc: nu așteptăm mai mult de câteva secunde.
  const limit = AbortSignal.timeout(OSRM_TIMEOUT_MS)
  const res = await fetch(`${OSRM[profile]}/${coords}?${params}`, {
    signal: signal ? AbortSignal.any([signal, limit]) : limit,
  })
  if (!res.ok) throw new Error(`Rutare indisponibilă (${res.status})`)
  const data = await res.json()
  if (data.code !== 'Ok') throw new Error(data.message || 'Nu s-a găsit niciun traseu')
  return data.routes
}

// ---------------------------------------------------------------- rezervă: Valhalla

const OSRM_TIMEOUT_MS = 6000
/** După un eșec OSRM, mergem direct la Valhalla câteva minute, fără să mai așteptăm timeout-uri. */
const OSRM_RETRY_MS = 5 * 60000
let osrmDownUntil = 0

const VALHALLA = 'https://valhalla1.openstreetmap.de/route'
const VALHALLA_COSTING: Record<TravelProfile, string> = { foot: 'pedestrian', bike: 'bicycle', car: 'auto' }

/** Serverul public Valhalla e gratuit, dar limitat: cel mult 2 cereri simultane. */
const MAX_VALHALLA_IN_FLIGHT = 2
let inFlight = 0
const waiting: (() => void)[] = []

async function throttled<T>(task: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_VALHALLA_IN_FLIGHT) await new Promise<void>((resolve) => waiting.push(resolve))
  inFlight++
  try {
    return await task()
  } finally {
    inFlight--
    waiting.shift()?.()
  }
}

/** Decodează un polyline cu precizie 6 (formatul Valhalla) în [lng, lat]. */
function decodePolyline6(value: string): [number, number][] {
  const points: [number, number][] = []
  let index = 0
  let lat = 0
  let lng = 0
  while (index < value.length) {
    const deltas: number[] = []
    for (let k = 0; k < 2; k++) {
      let shift = 0
      let result = 0
      let byte: number
      do {
        byte = value.charCodeAt(index++) - 63
        result |= (byte & 0x1f) << shift
        shift += 5
      } while (byte >= 0x20 && index < value.length)
      deltas.push(result & 1 ? ~(result >> 1) : result >> 1)
    }
    lat += deltas[0]
    lng += deltas[1]
    points.push([lng / 1e6, lat / 1e6])
  }
  return points
}

type ValhallaTrip = { summary: { length: number; time: number }; legs: { shape: string }[] }

function fromValhalla(trip: ValhallaTrip): OsrmRoute {
  return {
    distance: trip.summary.length * 1000,
    duration: trip.summary.time,
    geometry: { coordinates: trip.legs.flatMap((leg, i) => decodePolyline6(leg.shape).slice(i ? 1 : 0)) },
  }
}

async function fetchValhalla(
  profile: TravelProfile,
  points: LatLng[],
  alternatives: boolean,
  signal?: AbortSignal,
): Promise<OsrmRoute[]> {
  return throttled(async () => {
    const body = {
      // Punctele intermediare sunt „through”: traseul trece prin ele fără oprire sau întoarcere.
      locations: points.map((p, i) => ({
        lat: p.lat,
        lon: p.lng,
        type: i === 0 || i === points.length - 1 ? 'break' : 'through',
      })),
      costing: VALHALLA_COSTING[profile],
      alternates: alternatives ? 2 : 0,
      units: 'kilometers',
      directions_type: 'none',
    }
    const res = await fetch(`${VALHALLA}?${new URLSearchParams({ json: JSON.stringify(body) })}`, { signal })
    if (!res.ok) throw new Error(`Rutare indisponibilă (${res.status})`)
    const data = await res.json()
    if (!data.trip) throw new Error(data.error || 'Nu s-a găsit niciun traseu')
    return [data.trip, ...(data.alternates ?? []).map((a: { trip: ValhallaTrip }) => a.trip)].map(fromValhalla)
  })
}

/** OSRM când merge; altfel Valhalla. Anularea de către utilizator nu înseamnă că OSRM e căzut. */
async function fetchRoutes(
  profile: TravelProfile,
  points: LatLng[],
  alternatives: boolean,
  signal?: AbortSignal,
): Promise<OsrmRoute[]> {
  if (Date.now() >= osrmDownUntil) {
    try {
      return await fetchOsrm(profile, points, alternatives, signal)
    } catch (e) {
      if (signal?.aborted) throw e
      // „Niciun traseu” e un răspuns valid; doar lipsa răspunsului sau o eroare de server trec la rezervă.
      if (e instanceof Error && e.message.startsWith('Nu s-a găsit')) throw e
      osrmDownUntil = Date.now() + OSRM_RETRY_MS
    }
  }
  return fetchValhalla(profile, points, alternatives, signal)
}

// ---------------------------------------------------------------- zone de evitat

/** O zonă cu problemă: raportare (cerc), hazard sau șantier, cu ponderea ei în costul traseului. */
type Zone = { id: string; center: LatLng; radius: number; weight: number; polygon?: [number, number][] }

// Fumul și praful afectează direct aerul respirat; o groapă doar îngreunează deplasarea.
const CATEGORY_WEIGHT: Record<IssueCategory, number> = {
  pollution: 2,
  traffic: 1.2,
  construction: 1,
  infrastructure: 0.6,
  obstruction: 0.6,
  flooding: 0.6,
  lighting: 0.4,
  other: 0.6,
}
const SEVERITY_WEIGHT: Record<Severity, number> = { low: 0.7, medium: 1, high: 1.5 }
/** Cât crește costul unui metru în centrul unei zone de pondere 1 (scade liniar spre margine). */
const ZONE_WEIGHT = 1.5

function zonesOf(data: MapData): Zone[] {
  return [
    ...data.issues.map((i) => ({
      id: i.id,
      center: { lat: i.lat, lng: i.lng },
      radius: i.radius,
      weight: CATEGORY_WEIGHT[i.category] * SEVERITY_WEIGHT[i.severity],
    })),
    ...data.hazards.map((h) => ({ id: h.id, center: { lat: h.lat, lng: h.lng }, radius: 45, weight: 0.6 })),
    ...data.constructionZones.map((z) => {
      const center = polygonCenter(z.polygon)
      const radius = Math.max(...z.polygon.map(([lat, lng]) => haversine(center, { lat, lng })))
      return { id: z.id, center, radius, weight: 1, polygon: z.polygon }
    }),
  ]
}

/** Penalizarea într-un punct: suma zonelor care îl conțin, mai mare spre centrul lor. */
function zoneLoad(p: LatLng, zones: Zone[], hit?: Set<string>): number {
  let load = 0
  for (const z of zones) {
    const d = haversine(p, z.center)
    if (d >= z.radius) continue
    if (z.polygon) {
      if (!pointInPolygon(p, z.polygon)) continue
      load += z.weight
    } else load += z.weight * (1 - d / z.radius)
    hit?.add(z.id)
  }
  return load
}

/** Un punct deplasat cu `east` / `north` metri. */
function offset(p: LatLng, east: number, north: number): LatLng {
  return { lat: p.lat + north / 111320, lng: p.lng + east / (111320 * Math.cos((p.lat * Math.PI) / 180)) }
}

/**
 * Pentru zonele traversate de traseul direct: câte un punct de ocolire de fiecare parte, chiar în afara
 * cercului, perpendicular pe direcția traseului în dreptul zonei.
 */
function detourVias(route: [number, number][], zones: Zone[], from: LatLng, to: LatLng): LatLng[] {
  const crossed: { z: Zone; at: number; load: number }[] = []
  for (const z of zones) {
    if (z.radius < 60) continue // hazard-urile punctuale se ocolesc oricum pe străzile alăturate
    let best = -1
    let bestD = Infinity
    route.forEach(([lat, lng], i) => {
      const d = haversine({ lat, lng }, z.center)
      if (d < bestD) {
        best = i
        bestD = d
      }
    })
    if (best >= 0 && bestD < z.radius) crossed.push({ z, at: best, load: z.weight * (1 - bestD / z.radius) })
  }
  crossed.sort((x, y) => y.load - x.load)
  const vias: LatLng[] = []
  for (const { z, at } of crossed.slice(0, 2)) {
    const a = route[Math.max(0, at - 3)]
    const b = route[Math.min(route.length - 1, at + 3)]
    const k = Math.cos((z.center.lat * Math.PI) / 180)
    const dx = (b[1] - a[1]) * k
    const dy = b[0] - a[0]
    const len = Math.hypot(dx, dy) || 1
    const dist = z.radius * 1.15
    for (const side of [1, -1]) {
      const via = offset(z.center, (-dy / len) * dist * side, (dx / len) * dist * side)
      // Un punct de ocolire prea departe ar întoarce traseul din drum.
      if (haversine(from, via) + haversine(via, to) < haversine(from, to) * 2.5) vias.push(via)
    }
  }
  return vias
}

/** Puncte intermediare care forțează trasee alternative, inclusiv prin zonele cele mai curate. */
function viaCandidates(a: LatLng, b: LatLng, data: MapData, traffic: TrafficIndex, zones: Zone[]): LatLng[] {
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
      // Punctele de lângă bulevarde aglomerate sunt mai poluate decât arată senzorii rari.
      clean.push({
        p,
        aqi: aqiAt(p, data.sensors) * (1 + TRAFFIC_WEIGHT * traffic.levelAt(p, 80) + ZONE_WEIGHT * zoneLoad(p, zones)),
      })
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

/** Cât de mult crește expunerea pe un drum complet blocat față de unul liber. */
const TRAFFIC_WEIGHT = 1.5

function evaluate(route: OsrmRoute, data: MapData, traffic: TrafficIndex, zones: Zone[], id: string): RouteCandidate {
  const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number])
  let exposure = 0
  let weighted = 0
  let total = 0
  let trafficLoad = 0
  let busy = 0
  const hit = new Set<string>()

  for (let i = 1; i < coords.length; i++) {
    const p0 = { lat: coords[i - 1][0], lng: coords[i - 1][1] }
    const p1 = { lat: coords[i][0], lng: coords[i][1] }
    const seg = haversine(p0, p1)
    if (seg === 0) continue
    const mid = { lat: (p0.lat + p1.lat) / 2, lng: (p0.lng + p1.lng) / 2 }
    const aqi = aqiAt(mid, data.sensors)
    const level = traffic.levelAt(mid)
    // Zonele raportate cântăresc după cât de aproape de centrul lor trece traseul.
    const load = zoneLoad(mid, zones, hit)
    exposure += (aqi * seg * (1 + TRAFFIC_WEIGHT * level + ZONE_WEIGHT * load)) / 1000
    weighted += aqi * seg
    total += seg
    trafficLoad += level * seg
    if (level >= 0.55) busy += seg

  }

  return {
    id,
    coords,
    distance: route.distance,
    duration: route.duration,
    avgAqi: total ? weighted / total : 0,
    exposure,
    obstacles: hit.size,
    traffic: total ? trafficLoad / total : 0,
    busyDistance: busy,
  }
}

// Obstacolele și zonele raportate sunt deja în expunere, ponderate după distanța față de centrul lor.
const ecoCost = (c: RouteCandidate) => c.exposure

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
  traffic: TrafficSegment[],
  signal?: AbortSignal,
): Promise<RouteResult> {
  const index = new TrafficIndex(traffic)
  const zones = zonesOf(data)
  const direct = fetchRoutes(profile, [from, to], true, signal)
  const requests = [
    direct,
    ...viaCandidates(from, to, data, index, zones).map((via) => fetchRoutes(profile, [from, via, to], false, signal)),
    // A doua rundă: ocoliri pe lângă zonele raportate pe care le traversează traseul direct.
    direct.then((routes) => {
      const coords = routes[0]?.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]) ?? []
      return Promise.allSettled(
        detourVias(coords, zones, from, to).map((via) => fetchRoutes(profile, [from, via, to], false, signal)),
      ).then((r) => r.flatMap((x) => (x.status === 'fulfilled' ? x.value : [])))
    }),
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
    // eliminăm ocolurile absurde; până la 1,8× poate merita pentru a evita fum sau șantiere
    if (r.duration > fastestOsrm * 1.8) return
    const c = evaluate(r, data, index, zones, `r${i}`)
    if (!candidates.some((x) => isDuplicate(x, c))) candidates.push(c)
  })

  const minBy = (list: RouteCandidate[], f: (c: RouteCandidate) => number) =>
    list.reduce((best, c) => (f(c) < f(best) ? c : best))

  const fastest = minBy(candidates, (c) => c.duration)
  const cleanest = minBy(candidates, ecoCost)
  const minDur = fastest.duration
  const minEco = ecoCost(cleanest)
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
