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
  /** Aglomerarea medie pe traseu la ora plecării (0 = liber, 1 = blocat) */
  traffic: number
  /** Metri parcurși pe drumuri aglomerate sau blocate */
  busyDistance: number
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

export type LayerKey = 'pollution' | 'traffic' | 'hazards' | 'construction' | 'issues'
export type LayerVisibility = Record<LayerKey, boolean>

/** Indicele RNMCA (1 = Bun … 6 = Extrem de rău), din legislația românească. */
export type RnmcaLevel = { code: 1 | 2 | 3 | 4 | 5 | 6; label: string; recommendation: string }

export type ForecastPollutant = 'pm25' | 'pm10' | 'no2' | 'o3' | 'so2' | 'european_aqi'

export type AirForecastHour = { time: string; index: RnmcaLevel | null } & Partial<
  Record<ForecastPollutant, number | null>
>

/** Prognoza CAMS pentru fereastra călătoriei (`GET /environment/air-quality`). */
export type AirForecast = {
  available: boolean
  status: 'cached' | 'live' | 'unavailable' | 'beyond_forecast_horizon'
  window: { start: string; end: string }
  horizonEnd: string
  index: RnmcaLevel | null
  dominant: ForecastPollutant | null
  pollutants: Partial<Record<ForecastPollutant, { max: number; mean: number; unit: string; index?: RnmcaLevel }>>
  hourly: AirForecastHour[]
  attribution: string
  limitation: string
}

export type TrafficBand = 'low' | 'moderate' | 'heavy' | 'severe'

/** Un drum principal cu aglomerarea estimată la ora cerută (`GET /traffic`). */
export type TrafficSegment = {
  id: string
  name: string
  roadClass: string
  /** 0 = liber … 1 = blocat */
  level: number
  band: TrafficBand
  label: string
  source: 'profile' | 'profile_calibrated' | 'community_report' | 'tomtom'
  /** Viteze TomTom (doar pentru `source: 'tomtom'`) */
  currentSpeed?: number
  freeFlowSpeed?: number
  /** [lat, lng][] */
  coords: [number, number][]
}

export type TrafficSnapshot = {
  at: string
  cityBand: TrafficBand
  cityLabel: string
  sources: string[]
  segments: TrafficSegment[]
  limitation: string
}

/** Răspunsul asistentului: `report` înseamnă că mesajul nu e o întrebare și trebuie publicat. */
export type AssistantReply = { kind: 'answer'; reply: string } | { kind: 'report' }
