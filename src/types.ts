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
  /** Issue creat de utilizatorul curent */
  mine: boolean
  canVote: boolean
  canResolve: boolean
  myVote: 'confirm' | 'dispute' | null
}

export type MapData = {
  sensors: PollutionSensor[]
  constructionZones: ConstructionZone[]
  issues: UserIssue[]
}

/** Indicele RNMCA: 1 Bun … 6 Extrem de rău; 0 când valoarea lipsește. */
export type RnmcaCode = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type RnmcaPollutant = 'pm25' | 'pm10' | 'no2'

/** Concentrație (µg/m³) clasificată pe scara RNMCA. */
export type AirReading = {
  value: number | null
  code: RnmcaCode
  label: string
  recommendation: string | null
}

export type AirQualityHour = {
  /** ISO 8601, UTC */
  time: string
  pm25: number | null
  pm10: number | null
  no2: number | null
  o3: number | null
  so2: number | null
  europeanAqi: number | null
  /** Indicele general: cel mai rău dintre PM2.5, PM10 și NO₂ */
  code: RnmcaCode
  label: string
  pm25Code: RnmcaCode
  pm25Label: string
}

/** Calitatea aerului în Iași acum + prognoza orară CAMS (`GET /air-quality`). */
export type AirQuality = {
  /** Fusul orar al prognozei (Europe/Bucharest) */
  timezone: string
  /** Ora citirii curente, ISO 8601 UTC */
  updatedAt: string | null
  overall: AirReading & { pollutant: RnmcaPollutant | null }
  pm25: AirReading
  pm10: AirReading
  no2: AirReading
  o3: number | null
  so2: number | null
  europeanAqi: number | null
  /** PM2.5 la nivel „Moderat” sau mai rău */
  alert: boolean
  hours: AirQualityHour[]
  source: string
  license: string
  licenseUrl: string
  limitation: string
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
  /** Număr de șantiere / probleme întâlnite */
  obstacles: number
  /** Indice de trafic estimat din RNMCA IS-1, drumuri OSM și raportări active. */
  traffic?: { avg_congestion: number; congested_m: number; worst_level: string | null }
  /** Link generat de backend, cu puncte de ghidare pe traseul selectat. */
  googleMapsUrl?: string
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

export type LayerKey = 'pollution' | 'construction' | 'issues'
export type LayerVisibility = Record<LayerKey, boolean>
