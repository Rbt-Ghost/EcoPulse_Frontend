import type {
  AirQuality,
  AirReading,
  ConstructionZone,
  IssueCategory,
  IssueFeedback,
  MapData,
  PollutionSensor,
  RnmcaCode,
  RnmcaPollutant,
  Severity,
  UserIssue,
} from '../types'

/**
 * Stratul de acces la date: backend-ul EcoPulse (FastAPI, `/api/v1`).
 * Implicit `http://localhost:8000/api/v1`; altă adresă prin `VITE_API_URL`.
 *
 * Rute folosite:
 *   POST /auth/register, /auth/login              cont anonim per dispozitiv (JWT)
 *   GET  /reports                                 issues raportate de utilizatori
 *   GET  /reports/:id/feedback                    ce poate face utilizatorul curent
 *   POST /reports/:id/resolve                     autorul (sau un admin) elimină issue-ul
 *   POST /reports/:id/dispute                     alt utilizator confirmă că s-a rezolvat
 *   GET  /environment/observations                măsurători PM2.5 / PM10 / NO₂ recente (pe categorii)
 *   GET  /disruptions/features, /disruptions/planned   șantiere OSM și lucrări oficiale active
 *   POST /reports/from-text                       chat-ul de raportare: text → issue (rescris de LLM dacă e configurat)
 *   GET  /air-quality                             aer acum + prognoză orară CAMS, pe scara RNMCA (1–6)
 */
export const API_URL: string = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1').replace(/\/$/, '')

/** Câte confirmări de la alți utilizatori sunt necesare ca un issue să dispară (RESOLVE_DISPUTES în backend, expus și în `GET /config`). */
export const RESOLVE_THRESHOLD = 3
/** Precizia GPS minimă acceptată de backend pentru o raportare (`accuracy_m` ≤ 1000). */
export const MAX_REPORT_ACCURACY = 1000
/** Raza zonei afectate de un issue, în metri. */
export const ISSUE_RADIUS = 100

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// ---------------------------------------------------------------- sesiune

const DEVICE_KEY = 'ecopulse.device'
const OWN_KEY = 'ecopulse.ownReports'

type Device = { email: string; password: string }

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* stocare indisponibilă: sesiunea rămâne doar în memorie */
  }
}

function newDevice(): Device {
  const id = crypto.randomUUID()
  const device = { email: `device-${id.slice(0, 13)}@ecopulse.app`, password: crypto.randomUUID() }
  save(DEVICE_KEY, device)
  return device
}

/** Issue-urile create de pe acest dispozitiv (backend-ul nu expune autorul în listă). */
const ownReports = new Set<string>(load<string[]>(OWN_KEY) ?? [])
function rememberOwn(id: string) {
  ownReports.add(id)
  save(OWN_KEY, [...ownReports])
}

let device: Device | null = load<Device>(DEVICE_KEY)
let token: string | null = null
let signingIn: Promise<string> | null = null

async function raw(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
}

async function fail(res: Response): Promise<never> {
  let detail = ''
  try {
    const body = await res.json()
    if (typeof body.detail === 'string') detail = body.detail
    // Erorile de validare FastAPI sunt o listă de obiecte { loc, msg, type }.
    else if (Array.isArray(body.detail)) detail = body.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join('; ')
    else if (body.detail) detail = JSON.stringify(body.detail)
  } catch {
    /* fără corp JSON */
  }
  throw new ApiError(res.status, detail || `Eroare server (${res.status})`)
}

/** Fiecare dispozitiv primește automat un cont anonim; nu cerem email sau parolă utilizatorului. */
async function signIn(): Promise<string> {
  device ??= newDevice()
  const login = () => raw('/auth/login', { method: 'POST', body: JSON.stringify(device) })
  let res = await login()
  if (res.status === 401) {
    let reg = await raw('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ ...device, display_name: 'Locuitor Iași' }),
    })
    // Contul există, dar parola nu se potrivește (ex. stocare resetată): pornim un cont nou.
    if (reg.status === 409) {
      device = newDevice()
      reg = await raw('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ ...device, display_name: 'Locuitor Iași' }),
      })
    }
    if (!reg.ok) await fail(reg)
    res = await login()
  }
  if (!res.ok) await fail(res)
  token = (await res.json()).access_token as string
  return token
}

function session(): Promise<string> {
  if (token) return Promise.resolve(token)
  signingIn ??= signIn().finally(() => (signingIn = null))
  return signingIn
}

async function http<T>(path: string, init: RequestInit = {}, auth = false): Promise<T> {
  const send = async () =>
    raw(path, auth ? { ...init, headers: { ...init.headers, Authorization: `Bearer ${await session()}` } } : init)
  let res = await send()
  if (auth && res.status === 401) {
    // Token expirat (30 min) sau bază de date resetată.
    token = null
    res = await send()
  }
  if (!res.ok) await fail(res)
  return res.status === 204 ? (undefined as T) : res.json()
}

// ---------------------------------------------------------------- issues (reports)

type ReportCategory =
  | 'construction'
  | 'traffic'
  | 'smoke'
  | 'industrial'
  | 'machinery'
  | 'dust'
  | 'infrastructure'
  | 'flooding'
  | 'obstruction'
  | 'lighting'
  | 'other'

export type ApiReport = {
  id: string
  category: ReportCategory
  description: string
  latitude: number
  longitude: number
  observed_at: string
  expires_at: string
  severity: number
  status: 'pending' | 'confirmed' | 'resolved' | 'hidden' | 'expired'
  confirmations: number
  disputes: number
}

const REPORT_CATEGORY: Record<ReportCategory, IssueCategory> = {
  construction: 'construction',
  machinery: 'construction',
  traffic: 'traffic',
  smoke: 'pollution',
  dust: 'pollution',
  industrial: 'pollution',
  infrastructure: 'infrastructure',
  flooding: 'flooding',
  obstruction: 'obstruction',
  lighting: 'lighting',
  other: 'other',
}

const REPORT_TITLE: Record<ReportCategory, string> = {
  construction: 'Șantier semnalat',
  machinery: 'Utilaje în lucru',
  traffic: 'Trafic aglomerat',
  smoke: 'Fum în zonă',
  dust: 'Praf în suspensie',
  industrial: 'Poluare industrială',
  infrastructure: 'Problemă de infrastructură',
  flooding: 'Zonă inundată',
  obstruction: 'Obstacol pe drum',
  lighting: 'Iluminat defect',
  other: 'Problemă semnalată',
}

const severity = (n: number): Severity => (n >= 4 ? 'high' : n >= 3 ? 'medium' : 'low')

export const isOpen = (r: ApiReport) => r.status === 'pending' || r.status === 'confirmed'

export function toIssue(r: ApiReport): UserIssue {
  return {
    id: r.id,
    title: REPORT_TITLE[r.category] ?? REPORT_TITLE.other,
    description: r.description,
    category: REPORT_CATEGORY[r.category] ?? 'other',
    severity: severity(r.severity),
    lat: r.latitude,
    lng: r.longitude,
    radius: ISSUE_RADIUS,
    mine: ownReports.has(r.id),
    createdAt: r.observed_at,
    expiresAt: r.expires_at,
    resolveVotes: r.disputes,
    confirmations: r.confirmations,
    status: r.status,
  }
}

// ---------------------------------------------------------------- poluare

type Observation = {
  provider: string
  sensor_id: string
  category: string
  parameter: string
  value: number | null
  unit: string
  latitude: number
  longitude: number
  observed_at: string
  freshness: 'fresh' | 'stale'
  provenance: Record<string, unknown>
}

const PROVIDERS: Record<string, string> = {
  sensor_community: 'Sensor.Community',
  openaq: 'OpenAQ',
  cams: 'Copernicus CAMS',
  openmeteo: 'Open-Meteo',
}
const providerLabel = (p: string) => PROVIDERS[p] ?? p

/** Puncte de rupere AQI (scara US EPA) – [concentrație maximă, AQI maxim]. */
const BREAKPOINTS: Record<string, [number, number][]> = {
  pm25: [[9, 50], [35.4, 100], [55.4, 150], [125.4, 200], [225.4, 300]],
  pm10: [[54, 50], [154, 100], [254, 150], [354, 200], [424, 300]],
  // NO₂ în µg/m³ (ppb × 1.88)
  no2: [[100, 50], [188, 100], [677, 150], [1220, 200], [2349, 300]],
}

function subIndex(parameter: string, value: number): number {
  const bp = BREAKPOINTS[parameter]
  let lo: [number, number] = [0, 0]
  for (const hi of bp) {
    if (value <= hi[0]) return lo[1] + ((value - lo[0]) / (hi[0] - lo[0])) * (hi[1] - lo[1])
    lo = hi
  }
  return 300
}

function toSensors(observations: Observation[]): PollutionSensor[] {
  const now = Date.now()
  const measured = observations.filter(
    (o) =>
      o.value != null &&
      o.parameter in BREAKPOINTS &&
      // Valorile fără conversie (ex. NO₂ în ppb) nu sunt comparabile cu pragurile în µg/m³.
      o.unit === 'µg/m³' &&
      o.category !== 'WEATHER_CONTEXT' &&
      // Datele vechi (sincronizare oprită) nu descriu aerul de acum.
      o.freshness === 'fresh',
  )
  // Senzorii la sol au prioritate; modelul CAMS doar dacă nu există măsurători.
  const ground = measured.filter((o) => o.category !== 'MODEL_FORECAST')
  const source = ground.length ? ground : measured

  const groups = new Map<string, Observation[]>()
  for (const o of source) {
    // Sensor.Community are ID-uri diferite pentru fiecare cip de pe aceeași stație.
    const key = `${o.provider}:${o.latitude.toFixed(4)}:${o.longitude.toFixed(4)}`
    groups.set(key, [...(groups.get(key) ?? []), o])
  }

  return [...groups.entries()].flatMap(([key, items]) => {
    // Valoarea cea mai apropiată de momentul curent: ultima măsurătoare sau, pentru prognoza
    // CAMS (orară, pe 3 zile), ora curentă – nu ultima oră din prognoză.
    const distance = (o: Observation) => Math.abs(Date.parse(o.observed_at) - now)
    const latest: Record<string, Observation> = {}
    for (const o of items) {
      if (!latest[o.parameter] || distance(o) < distance(latest[o.parameter])) latest[o.parameter] = o
    }
    const values = Object.values(latest)
    const aqi = Math.round(Math.max(...values.map((o) => subIndex(o.parameter, o.value!))))
    if (!Number.isFinite(aqi)) return []
    const first = values[0]
    const name = (first.provenance.location_name as string) || `${providerLabel(first.provider)} #${first.sensor_id}`
    const round = (o?: Observation) => (o ? Math.round(o.value! * 10) / 10 : null)
    return [
      {
        id: key,
        name,
        lat: first.latitude,
        lng: first.longitude,
        aqi,
        pm25: round(latest.pm25),
        pm10: round(latest.pm10),
        no2: round(latest.no2),
        updatedAt: values.reduce((a, o) => (o.observed_at > a ? o.observed_at : a), first.observed_at),
        source: providerLabel(first.provider),
      },
    ]
  })
}

// ---------------------------------------------------------------- șantiere

type Feature = {
  id: string
  latitude: number
  longitude: number
  geometry: { type: 'Point' | 'LineString'; coordinates: number[] | number[][] } | null
  tags: Record<string, string> | null
  retrieved_at: string
}

type PlannedWork = {
  id: string
  title: string
  description: string | null
  latitude: number | null
  longitude: number | null
  starts_at: string | null
  ends_at: string | null
  original_url: string
}

const OSM = 'OpenStreetMap'

function featureTitle(tags: Record<string, string>): string {
  const what = tags.highway === 'construction' ? 'Drum în lucru' : tags.building || tags.construction === 'yes' ? 'Construcție' : 'Șantier'
  return tags.name ? `${what} · ${tags.name}` : what
}

function featureDescription(tags: Record<string, string>): string {
  const kind = tags.construction && tags.construction !== 'yes' ? ` (${tags.construction})` : ''
  return `Zonă marcată în construcție pe OpenStreetMap${kind}. Perioada și restricțiile nu sunt confirmate oficial.`
}

const M_PER_DEG_LAT = 111_320

/** Pătrat cu latura 2 × `half` metri în jurul unui punct. */
function squareAround(lat: number, lng: number, half: number): [number, number][] {
  const dLat = half / M_PER_DEG_LAT
  const dLng = dLat / Math.cos((lat * Math.PI) / 180)
  return [
    [lat - dLat, lng - dLng],
    [lat - dLat, lng + dLng],
    [lat + dLat, lng + dLng],
    [lat + dLat, lng - dLng],
  ]
}

/** Culoar de lățime 2 × `half` metri de-a lungul unui drum ([lng, lat][], ca în GeoJSON). */
function corridor(line: number[][], half: number): [number, number][] {
  const kx = M_PER_DEG_LAT * Math.cos((line[0][1] * Math.PI) / 180)
  const pts = line.map(([lng, lat]) => ({ x: lng * kx, y: lat * M_PER_DEG_LAT }))
  const left: [number, number][] = []
  const right: [number, number][] = []
  pts.forEach((p, i) => {
    // Normala medie a segmentelor vecine vârfului.
    const a = pts[Math.max(i - 1, 0)]
    const b = pts[Math.min(i + 1, pts.length - 1)]
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const nx = (-(b.y - a.y) / len) * half
    const ny = ((b.x - a.x) / len) * half
    left.push([(p.y + ny) / M_PER_DEG_LAT, (p.x + nx) / kx])
    right.push([(p.y - ny) / M_PER_DEG_LAT, (p.x - nx) / kx])
  })
  return [...left, ...right.reverse()]
}

/**
 * Tot ce întoarce `GET /disruptions/features` devine zonă în construcție:
 * contururile închise rămân poligoane, drumurile în lucru devin un culoar de ~20 m,
 * iar punctele un pătrat de ~50 m.
 */
function featureZones(features: Feature[]): ConstructionZone[] {
  return features.flatMap((raw) => {
    const tags = raw.tags ?? {}
    const line = raw.geometry?.type === 'LineString' ? (raw.geometry.coordinates as number[][]) : null
    const closed =
      line && line.length >= 4 && line[0][0] === line.at(-1)![0] && line[0][1] === line.at(-1)![1]
    const polygon =
      line && closed && tags.highway !== 'construction'
        ? line.map(([lng, lat]) => [lat, lng] as [number, number])
        : line && line.length >= 2
          ? corridor(line, 10)
          : Number.isFinite(raw.latitude) && Number.isFinite(raw.longitude)
            ? squareAround(raw.latitude, raw.longitude, 25)
            : null
    if (!polygon) return []
    return [{ id: raw.id, title: featureTitle(tags), description: featureDescription(tags), polygon, source: OSM }]
  })
}

/** Lucrările oficiale au doar un punct; le desenăm ca pătrat de ~80 m. */
function workZone(w: PlannedWork & { latitude: number; longitude: number }): ConstructionZone {
  return {
    id: w.id,
    title: w.title,
    description: w.description || 'Lucrare anunțată oficial.',
    polygon: squareAround(w.latitude, w.longitude, 40),
    startDate: w.starts_at ?? undefined,
    endDate: w.ends_at ?? undefined,
    source: (() => {
      try {
        return new URL(w.original_url).hostname
      } catch {
        return 'sursă oficială'
      }
    })(),
  }
}

// ---------------------------------------------------------------- calitatea aerului

type ApiReading = { value: number | null; code: number; label: string; recommendation?: string | null }

type ApiAirQuality = {
  timezone: string | null
  current: {
    timestamp_utc: string | null
    pm2_5: ApiReading
    pm10: ApiReading
    no2: ApiReading
    ozone: { value: number | null }
    so2: { value: number | null }
    european_aqi: number | null
    rnmca: ApiReading & { pollutant: 'pm2_5' | 'pm10' | 'no2' | null }
    alert: boolean
  }
  forecast_hourly: {
    datetime_utc: string | null
    pm2_5: number | null
    pm10: number | null
    no2: number | null
    ozone: number | null
    so2: number | null
    european_aqi: number | null
    aqi_pm25_code: number
    aqi_pm25_label: string
    aqi_code: number
    aqi_label: string
  }[]
  provenance: { attribution: string; license: string; license_url: string; limitation: string }
}

const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

const rnmcaCode = (v: unknown): RnmcaCode =>
  typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 6 ? (v as RnmcaCode) : 0

function toReading(r: ApiReading | undefined): AirReading {
  const code = rnmcaCode(r?.code)
  return {
    value: finite(r?.value),
    code,
    label: code ? r!.label : 'Necunoscut',
    recommendation: code ? r!.recommendation ?? null : null,
  }
}

const POLLUTANT: Record<'pm2_5' | 'pm10' | 'no2', RnmcaPollutant> = { pm2_5: 'pm25', pm10: 'pm10', no2: 'no2' }

function toAirQuality(raw: ApiAirQuality): AirQuality {
  const c = raw.current
  return {
    timezone: raw.timezone || 'Europe/Bucharest',
    updatedAt: c.timestamp_utc,
    overall: { ...toReading(c.rnmca), pollutant: c.rnmca?.pollutant ? POLLUTANT[c.rnmca.pollutant] : null },
    pm25: toReading(c.pm2_5),
    pm10: toReading(c.pm10),
    no2: toReading(c.no2),
    o3: finite(c.ozone?.value),
    so2: finite(c.so2?.value),
    europeanAqi: finite(c.european_aqi),
    alert: c.alert === true,
    hours: (raw.forecast_hourly ?? []).flatMap((h) =>
      h.datetime_utc && !Number.isNaN(Date.parse(h.datetime_utc))
        ? [
            {
              time: h.datetime_utc,
              pm25: finite(h.pm2_5),
              pm10: finite(h.pm10),
              no2: finite(h.no2),
              o3: finite(h.ozone),
              so2: finite(h.so2),
              europeanAqi: finite(h.european_aqi),
              code: rnmcaCode(h.aqi_code),
              label: rnmcaCode(h.aqi_code) ? h.aqi_label : 'Necunoscut',
              pm25Code: rnmcaCode(h.aqi_pm25_code),
              pm25Label: rnmcaCode(h.aqi_pm25_code) ? h.aqi_pm25_label : 'Necunoscut',
            },
          ]
        : [],
    ),
    source: raw.provenance.attribution,
    license: raw.provenance.license,
    licenseUrl: raw.provenance.license_url,
    limitation: raw.provenance.limitation,
  }
}

// ---------------------------------------------------------------- raportare din chat

/** Locul raportării: GPS-ul browserului sau un punct ales manual pe hartă. */
export type ReportPlace = { lat: number; lng: number; accuracy?: number }

export type BrowserFix = { lat: number; lng: number; accuracy: number; timestamp: number }

export type TextReportReply = { reply: string; issue: UserIssue }

// ---------------------------------------------------------------- API public

/**
 * Observațiile recente, cerute separat pe categorii: altfel prognoza CAMS (72 de ore × 4 poluanți,
 * sincronizată în bloc) poate ocupa singură limita de 500 de rânduri și ascunde senzorii.
 */
function observationsQuery(category: string, fromMs: number, toMs: number, limit = 500): string {
  const params = new URLSearchParams({
    category,
    since: new Date(Date.now() + fromMs).toISOString(),
    until: new Date(Date.now() + toMs).toISOString(),
    limit: String(limit),
  })
  return `/environment/observations?${params}`
}

const HOUR = 3_600_000

export const api = {
  async getMapData(): Promise<MapData> {
    const [reports, sensors, official, forecast, features, works] = await Promise.allSettled([
      http<{ items: ApiReport[] }>('/reports?limit=100'),
      http<{ items: Observation[] }>(observationsQuery('LOW_COST_SENSOR_MEASUREMENT', -2 * HOUR, 0.25 * HOUR)),
      http<{ items: Observation[] }>(observationsQuery('OFFICIAL_MEASUREMENT', -3 * HOUR, 0.25 * HOUR)),
      http<{ items: Observation[] }>(observationsQuery('MODEL_FORECAST', -1.5 * HOUR, 1.5 * HOUR, 100)),
      http<{ items: Feature[] }>('/disruptions/features?limit=500'),
      http<{ items: PlannedWork[] }>('/disruptions/planned'),
    ])
    const all = [reports, sensors, official, forecast, features, works]
    if (all.every((r) => r.status === 'rejected')) throw (reports as PromiseRejectedResult).reason
    const items = <T>(r: PromiseSettledResult<{ items: T[] }>) => (r.status === 'fulfilled' ? r.value.items : [])

    const located = items(works).filter(
      (w): w is PlannedWork & { latitude: number; longitude: number } => w.latitude != null && w.longitude != null,
    )
    return {
      sensors: toSensors([...items(sensors), ...items(official), ...items(forecast)]),
      constructionZones: [...featureZones(items(features)), ...located.map(workZone)],
      issues: items(reports).filter(isOpen).map(toIssue),
    }
  },

  /** Calitatea aerului acum + prognoza orară (CAMS, 3 zile); serverul o păstrează 10 minute în cache. */
  async getAirQuality(): Promise<AirQuality> {
    return toAirQuality(await http<ApiAirQuality>('/air-quality'))
  },

  async getFeedback(id: string): Promise<IssueFeedback> {
    const f = await http<{
      can_vote: boolean
      can_resolve: boolean
      reason: 'own_report' | 'closed' | 'already_voted' | null
      my_vote: IssueFeedback['myVote']
    }>(`/reports/${id}/feedback`, {}, true)
    // `can_resolve` e adevărat și pentru administratori; autorul se recunoaște după `reason`.
    return { mine: f.reason === 'own_report', canVote: f.can_vote, canResolve: f.can_resolve, myVote: f.my_vote }
  },

  /** Autorul (sau un administrator) închide issue-ul. Întoarce `null` când a dispărut de pe hartă. */
  async resolveIssue(id: string): Promise<UserIssue | null> {
    const r = await http<ApiReport>(`/reports/${id}/resolve`, { method: 'POST' }, true)
    return isOpen(r) ? toIssue(r) : null
  },

  /** Alt utilizator confirmă că problema s-a rezolvat; după RESOLVE_THRESHOLD confirmări dispare. */
  async voteResolved(id: string): Promise<UserIssue | null> {
    const r = await http<ApiReport>(`/reports/${id}/dispute`, { method: 'POST' }, true)
    return isOpen(r) ? toIssue(r) : null
  },

  /**
   * Publică direct un issue din textul utilizatorului; backend-ul îl rescrie coerent (LLM) și
   * alege categoria și gravitatea. Nu pune întrebări înapoi.
   */
  async reportFromText(text: string, place: ReportPlace): Promise<TextReportReply> {
    const res = await http<{ reply: string; report: ApiReport }>(
      '/reports/from-text',
      {
        method: 'POST',
        body: JSON.stringify({ text, latitude: place.lat, longitude: place.lng, accuracy_m: place.accuracy }),
      },
      true,
    )
    rememberOwn(res.report.id)
    return { reply: res.reply, issue: toIssue(res.report) }
  },
}
