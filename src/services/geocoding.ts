import { IASI_BOUNDS } from '../data/iasi'
import type { LatLng, RoutePlace } from '../types'

// Nominatim (OpenStreetMap) – limitat la zona Iașului.
const NOMINATIM = 'https://nominatim.openstreetmap.org'

type NominatimResult = {
  lat: string
  lon: string
  display_name: string
  name?: string
  address?: Record<string, string>
}

function shortLabel(r: NominatimResult): string {
  const a = r.address ?? {}
  const main = r.name || a.road || a.pedestrian || a.neighbourhood || a.suburb
  const street = a.road && a.road !== main ? a.road : undefined
  const parts = [main, street, a.house_number && !main?.includes(a.house_number) ? a.house_number : undefined]
    .filter(Boolean)
  return parts.length ? parts.join(', ') : r.display_name.split(',').slice(0, 2).join(',')
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<RoutePlace[]> {
  const [[s, w], [n, e]] = IASI_BOUNDS
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '6',
    viewbox: `${w},${n},${e},${s}`,
    bounded: '1',
    'accept-language': 'ro',
  })
  const res = await fetch(`${NOMINATIM}/search?${params}`, { signal })
  if (!res.ok) throw new Error('Căutarea a eșuat')
  const data: NominatimResult[] = await res.json()
  return data.map((r) => ({ lat: +r.lat, lng: +r.lon, label: shortLabel(r) }))
}

export async function reverseGeocode(p: LatLng): Promise<string> {
  try {
    const params = new URLSearchParams({
      lat: String(p.lat),
      lon: String(p.lng),
      format: 'jsonv2',
      zoom: '18',
      addressdetails: '1',
      'accept-language': 'ro',
    })
    const res = await fetch(`${NOMINATIM}/reverse?${params}`)
    if (!res.ok) throw new Error()
    return shortLabel(await res.json())
  } catch {
    return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`
  }
}
