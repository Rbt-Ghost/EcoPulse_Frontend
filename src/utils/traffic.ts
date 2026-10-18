import type { LatLng, TrafficBand, TrafficSegment } from '../types'

/** Culori pentru nivelurile de trafic (liber → blocat). */
export const TRAFFIC_COLORS: Record<TrafficBand, string> = {
  low: '#22c55e',
  moderate: '#eab308',
  heavy: '#f97316',
  severe: '#dc2626',
}

export const TRAFFIC_LABELS: Record<TrafficBand, string> = {
  low: 'fluent',
  moderate: 'moderat',
  heavy: 'aglomerat',
  severe: 'blocat',
}

export function trafficBand(level: number): TrafficBand {
  return level < 0.3 ? 'low' : level < 0.55 ? 'moderate' : level < 0.8 ? 'heavy' : 'severe'
}

// ~170 m pe latitudine: o celulă conține doar drumurile din apropiere.
const CELL = 0.0015

type Edge = { a: LatLng; b: LatLng; level: number }

/** Index spațial pe grilă: ce nivel de trafic are drumul principal aflat la `radius` m de un punct. */
export class TrafficIndex {
  private cells = new Map<string, Edge[]>()
  readonly empty: boolean

  constructor(segments: TrafficSegment[]) {
    for (const s of segments) {
      for (let i = 1; i < s.coords.length; i++) {
        const a = { lat: s.coords[i - 1][0], lng: s.coords[i - 1][1] }
        const b = { lat: s.coords[i][0], lng: s.coords[i][1] }
        const edge = { a, b, level: s.level }
        const [r0, r1] = [Math.floor(Math.min(a.lat, b.lat) / CELL), Math.floor(Math.max(a.lat, b.lat) / CELL)]
        const [c0, c1] = [Math.floor(Math.min(a.lng, b.lng) / CELL), Math.floor(Math.max(a.lng, b.lng) / CELL)]
        for (let r = r0; r <= r1; r++)
          for (let c = c0; c <= c1; c++) {
            const key = `${r}:${c}`
            const list = this.cells.get(key)
            if (list) list.push(edge)
            else this.cells.set(key, [edge])
          }
      }
    }
    this.empty = this.cells.size === 0
  }

  /** Cel mai mare nivel de trafic (0–1) dintre drumurile aflate la cel mult `radius` metri; 0 dacă nu e niciunul. */
  levelAt(p: LatLng, radius = 25): number {
    if (this.empty) return 0
    const r = Math.floor(p.lat / CELL)
    const c = Math.floor(p.lng / CELL)
    let best = 0
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        for (const e of this.cells.get(`${r + dr}:${c + dc}`) ?? []) {
          if (e.level > best && distanceToEdge(p, e.a, e.b) <= radius) best = e.level
        }
      }
    return best
  }
}

/** Distanța în metri de la p la segmentul a–b (proiecție locală, suficientă la scara unui oraș). */
function distanceToEdge(p: LatLng, a: LatLng, b: LatLng): number {
  const k = Math.cos((p.lat * Math.PI) / 180) * 111320
  const ax = (a.lng - p.lng) * k
  const ay = (a.lat - p.lat) * 111320
  const bx = (b.lng - p.lng) * k
  const by = (b.lat - p.lat) * 111320
  const dx = bx - ax
  const dy = by - ay
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0
  return Math.hypot(ax + t * dx, ay + t * dy)
}
