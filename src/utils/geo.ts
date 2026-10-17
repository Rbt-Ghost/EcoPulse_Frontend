import type { LatLng, PollutionSensor } from '../types'

const R = 6371000

export function haversine(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Interpolare IDW a indicelui de poluare într-un punct oarecare. */
export function aqiAt(p: LatLng, sensors: PollutionSensor[]): number {
  let num = 0
  let den = 0
  for (const s of sensors) {
    const d = Math.max(haversine(p, s), 60)
    if (d < 80) return s.aqi
    const w = 1 / d ** 3
    num += w * s.aqi
    den += w
  }
  return den ? num / den : 50
}

export function pointInPolygon(p: LatLng, poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i]
    const [yj, xj] = poly[j]
    if (yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

export function polygonCenter(poly: [number, number][]): LatLng {
  const lat = poly.reduce((s, p) => s + p[0], 0) / poly.length
  const lng = poly.reduce((s, p) => s + p[1], 0) / poly.length
  return { lat, lng }
}

/** Punct deplasat perpendicular față de segmentul a→b, la mijloc, cu `factor` × lungime. */
export function perpendicularOffset(a: LatLng, b: LatLng, factor: number): LatLng {
  const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }
  const k = Math.cos((mid.lat * Math.PI) / 180)
  const dx = (b.lng - a.lng) * k
  const dy = b.lat - a.lat
  return { lat: mid.lat + dx * factor, lng: mid.lng - (dy * factor) / k }
}

export type AqiBand = { max: number; label: string; color: string; text: string }

export const AQI_BANDS: AqiBand[] = [
  { max: 50, label: 'Bun', color: '#22c55e', text: 'Aer curat' },
  { max: 100, label: 'Moderat', color: '#eab308', text: 'Acceptabil' },
  { max: 150, label: 'Nesănătos (sensibili)', color: '#f97316', text: 'Grupuri sensibile' },
  { max: 200, label: 'Nesănătos', color: '#ef4444', text: 'Evitați efortul' },
  { max: Infinity, label: 'Foarte nesănătos', color: '#a21caf', text: 'Periculos' },
]

export function aqiBand(aqi: number): AqiBand {
  return AQI_BANDS.find((b) => aqi <= b.max)!
}

/** Culoare continuă pentru heatmap (verde → galben → portocaliu → roșu → mov). */
export function aqiColor(aqi: number): string {
  const stops: [number, [number, number, number]][] = [
    [0, [34, 197, 94]],
    [60, [163, 230, 53]],
    [100, [234, 179, 8]],
    [140, [249, 115, 22]],
    [175, [239, 68, 68]],
    [220, [162, 28, 175]],
  ]
  if (aqi <= stops[0][0]) return `rgb(${stops[0][1].join(',')})`
  for (let i = 1; i < stops.length; i++) {
    const [v1, c1] = stops[i]
    const [v0, c0] = stops[i - 1]
    if (aqi <= v1) {
      const t = (aqi - v0) / (v1 - v0)
      const c = c0.map((x, j) => Math.round(x + (c1[j] - x) * t))
      return `rgb(${c.join(',')})`
    }
  }
  return `rgb(${stops[stops.length - 1][1].join(',')})`
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`
}

export function formatDuration(s: number): string {
  const min = Math.round(s / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return `${h} h ${min % 60} min`
}

export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'acum câteva secunde'
  if (diff < 3600) return `acum ${Math.round(diff / 60)} min`
  if (diff < 86400) return `acum ${Math.round(diff / 3600)} h`
  const d = Math.round(diff / 86400)
  return d === 1 ? 'ieri' : `acum ${d} zile`
}
