import type {
  LatLng,
  LayerVisibility,
  MapData,
  RouteMode,
  RoutePlace,
  RouteResult,
  UserIssue,
} from '../types'

export type MapFocus = { lat: number; lng: number; zoom?: number; key: number }

/** Props comune pentru implementările de hartă (Google Maps / Leaflet). */
export type MapViewProps = {
  data: MapData | null
  layers: LayerVisibility
  userId: string
  userPosition: LatLng
  hasGps: boolean
  from: RoutePlace | null
  to: RoutePlace | null
  routes: RouteResult | null
  mode: RouteMode
  onModeChange: (m: RouteMode) => void
  onPickPoint: ((which: 'from' | 'to', p: LatLng) => void) | null
  focus: MapFocus | null
  freshIssueId: string | null
  onDeleteIssue: (issue: UserIssue) => Promise<void>
  onVoteResolve: (issue: UserIssue) => Promise<void>
}

/** Cheia Google Maps; fără ea aplicația folosește harta Leaflet + OpenStreetMap. */
export const GOOGLE_MAPS_KEY: string = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''
/** Map ID (Cloud styling). `DEMO_MAP_ID` funcționează pentru dezvoltare. */
export const GOOGLE_MAPS_MAP_ID: string = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID'

/** Ordinea de desenare: traseul activ deasupra celorlalte. */
export function routeDrawOrder(mode: RouteMode): RouteMode[] {
  const order: RouteMode[] = ['fastest', 'balanced', 'cleanest']
  return [...order.filter((m) => m !== mode), mode]
}
