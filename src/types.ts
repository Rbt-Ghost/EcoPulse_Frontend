export type LatLng = { lat: number; lng: number }

export type Severity = 'low' | 'medium' | 'high'

export type PollutionSensor = {
  id: string
  name: string
  lat: number
  lng: number
  /** Indice calitate aer (0–300, scara EU/US simplificată) */
  aqi: number
  pm25: number
  pm10: number
  no2: number
  updatedAt: string
}

export type HazardKind =
  | 'pothole'
  | 'sidewalk'
  | 'flooding'
  | 'manhole'
  | 'traffic_light'
  | 'lighting'

export type InfrastructureHazard = {
  id: string
  kind: HazardKind
  title: string
  description: string
  severity: Severity
  lat: number
  lng: number
  reportedAt: string
}

export type ConstructionZone = {
  id: string
  title: string
  description: string
  /** Poligon [lat, lng][] */
  polygon: [number, number][]
  startDate: string
  endDate: string
  contractor?: string
}

export type IssueCategory =
  | 'infrastructure'
  | 'pollution'
  | 'construction'
  | 'traffic'
  | 'flooding'
  | 'obstruction'
  | 'lighting'
  | 'other'

export type UserIssue = {
  id: string
  title: string
  description: string
  category: IssueCategory
  severity: Severity
  lat: number
  lng: number
  /** Raza zonei afectate, în metri */
  radius: number
  createdBy: string
  createdAt: string
  /** Utilizatori (alții decât autorul) care au confirmat că problema s-a rezolvat */
  resolveVotes: string[]
  source: 'chat' | 'manual'
}

export type MapData = {
  sensors: PollutionSensor[]
  hazards: InfrastructureHazard[]
  constructionZones: ConstructionZone[]
  issues: UserIssue[]
}

export type RouteMode = 'cleanest' | 'balanced' | 'fastest'

export type TravelProfile = 'foot' | 'bike' | 'car'

export type RoutePlace = LatLng & { label: string }

export type RouteCandidate = {
  id: string
  /** [lat, lng][] */
  coords: [number, number][]
  distance: number // metri
  duration: number // secunde
  /** Indice mediu de poluare de-a lungul traseului */
  avgAqi: number
  /** Expunere cumulată (AQI × km) */
  exposure: number
  /** Număr de hazard-uri / șantiere / probleme întâlnite */
  obstacles: number
}

export type RouteResult = Record<RouteMode, RouteCandidate>

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: string
  issue?: UserIssue
  pending?: boolean
}

export type LayerKey = 'pollution' | 'hazards' | 'construction' | 'issues'
export type LayerVisibility = Record<LayerKey, boolean>
