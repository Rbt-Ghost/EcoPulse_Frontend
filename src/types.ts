export type LatLng = { lat: number; lng: number }

export type Severity = 'low' | 'medium' | 'high'

export type PollutionSensor = {
  id: string
  name: string
  lat: number
  lng: number
  /** Indice calitate aer (0–300, scara EU/US simplificată) */
  aqi: number
  pm25: number | null
  pm10: number | null
  no2: number | null
  updatedAt: string
  /** Furnizorul datelor (ex. Sensor.Community, OpenAQ) */
  source: string
}

export type HazardKind =
  | 'pothole'
  | 'sidewalk'
  | 'flooding'
  | 'manhole'
  | 'traffic_light'
  | 'lighting'
  | 'roadworks'

export type InfrastructureHazard = {
  id: string
  kind: HazardKind
  title: string
  description: string
  severity: Severity
  lat: number
  lng: number
  reportedAt: string
  source: string
}

export type ConstructionZone = {
  id: string
  title: string
  description: string
  /** Poligon [lat, lng][] */
  polygon: [number, number][]
  startDate?: string
  endDate?: string
  contractor?: string
  source: string
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
  /** Issue creat de utilizatorul curent (de pe acest dispozitiv) */
  mine: boolean
  createdAt: string
  expiresAt: string
  /** Câți alți utilizatori au confirmat că problema s-a rezolvat */
  resolveVotes: number
  /** Câți alți utilizatori au confirmat că problema există */
  confirmations: number
  status: 'pending' | 'confirmed' | 'resolved' | 'hidden' | 'expired'
}

/** `resolve`: autorul elimină issue-ul; `vote`: alt utilizator confirmă că s-a rezolvat. */
export type IssueAction = 'resolve' | 'vote'

/** Ce poate face utilizatorul curent cu un issue (din backend). */
export type IssueFeedback = {
  canVote: boolean
  canResolve: boolean
  myVote: 'confirm' | 'dispute' | null
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
  /** Raportare care așteaptă ca utilizatorul să aleagă locul pe hartă (fără GPS) */
  pickLocation?: boolean
}

export type LayerKey = 'pollution' | 'hazards' | 'construction' | 'issues'
export type LayerVisibility = Record<LayerKey, boolean>
