import type {
  ConstructionZone,
  InfrastructureHazard,
  PollutionSensor,
  UserIssue,
} from '../types'

// Date demonstrative pentru Iași, folosite până la conectarea backend-ului.

const now = Date.now()
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString()

export const IASI_CENTER = { lat: 47.1585, lng: 27.6014 }
export const IASI_BOUNDS: [[number, number], [number, number]] = [
  [47.105, 27.48],
  [47.215, 27.7],
]

export const mockSensors: PollutionSensor[] = [
  { id: 's1', name: 'Piața Unirii', lat: 47.1652, lng: 27.5806, aqi: 78, pm25: 24, pm10: 41, no2: 38 },
  { id: 's2', name: 'Palas', lat: 47.1566, lng: 27.5872, aqi: 64, pm25: 19, pm10: 33, no2: 31 },
  { id: 's3', name: 'Podu Roș', lat: 47.1526, lng: 27.5934, aqi: 142, pm25: 52, pm10: 88, no2: 71 },
  { id: 's4', name: 'Tătărași', lat: 47.1688, lng: 27.6052, aqi: 96, pm25: 31, pm10: 54, no2: 46 },
  { id: 's5', name: 'Parcul Copou', lat: 47.1802, lng: 27.5678, aqi: 22, pm25: 6, pm10: 12, no2: 9 },
  { id: 's6', name: 'Păcurari', lat: 47.1705, lng: 27.5498, aqi: 71, pm25: 22, pm10: 38, no2: 35 },
  { id: 's7', name: 'Nicolina', lat: 47.1432, lng: 27.5851, aqi: 118, pm25: 41, pm10: 70, no2: 58 },
  { id: 's8', name: 'CUG / Dacia', lat: 47.1395, lng: 27.5425, aqi: 164, pm25: 63, pm10: 104, no2: 66 },
  { id: 's9', name: 'Gara Iași', lat: 47.1648, lng: 27.5696, aqi: 104, pm25: 36, pm10: 60, no2: 55 },
  { id: 's10', name: 'Alexandru cel Bun', lat: 47.1578, lng: 27.5452, aqi: 58, pm25: 17, pm10: 29, no2: 27 },
  { id: 's11', name: 'Bucium', lat: 47.1298, lng: 27.6247, aqi: 26, pm25: 7, pm10: 14, no2: 11 },
  { id: 's12', name: 'Tudor Vladimirescu', lat: 47.1612, lng: 27.6181, aqi: 88, pm25: 28, pm10: 47, no2: 42 },
  { id: 's13', name: 'Iulius Mall', lat: 47.1558, lng: 27.6045, aqi: 126, pm25: 45, pm10: 76, no2: 63 },
  { id: 's14', name: 'Aeroport', lat: 47.1786, lng: 27.6208, aqi: 69, pm25: 21, pm10: 36, no2: 30 },
  { id: 's15', name: 'Parcul Ciric', lat: 47.1872, lng: 27.6005, aqi: 18, pm25: 5, pm10: 10, no2: 7 },
  { id: 's16', name: 'Grădina Botanică', lat: 47.1868, lng: 27.5552, aqi: 15, pm25: 4, pm10: 9, no2: 6 },
  { id: 's17', name: 'Zona Industrială Sud', lat: 47.1352, lng: 27.6062, aqi: 178, pm25: 71, pm10: 118, no2: 74 },
  { id: 's18', name: 'Galata', lat: 47.1418, lng: 27.5632, aqi: 62, pm25: 18, pm10: 31, no2: 28 },
  { id: 's19', name: 'Canta', lat: 47.1752, lng: 27.5602, aqi: 74, pm25: 23, pm10: 39, no2: 34 },
  { id: 's20', name: 'Bularga', lat: 47.1505, lng: 27.6268, aqi: 84, pm25: 27, pm10: 45, no2: 40 },
].map((s) => ({ ...s, updatedAt: hoursAgo(0.3) }))

export const mockHazards: InfrastructureHazard[] = [
  {
    id: 'h1', kind: 'pothole', severity: 'high', lat: 47.1601, lng: 27.5893,
    title: 'Groapă adâncă în carosabil',
    description: 'Groapă de ~40 cm pe banda 2, Bd. Ștefan cel Mare spre Palas.',
    reportedAt: hoursAgo(30),
  },
  {
    id: 'h2', kind: 'sidewalk', severity: 'medium', lat: 47.1712, lng: 27.5751,
    title: 'Trotuar degradat',
    description: 'Plăci de pavaj lipsă pe Bd. Carol I, lângă Universitate.',
    reportedAt: hoursAgo(72),
  },
  {
    id: 'h3', kind: 'flooding', severity: 'high', lat: 47.1488, lng: 27.5958,
    title: 'Băltire persistentă',
    description: 'Canalizare înfundată, apa se adună după ploaie în pasajul Podu Roș.',
    reportedAt: hoursAgo(12),
  },
  {
    id: 'h4', kind: 'manhole', severity: 'high', lat: 47.1662, lng: 27.6011,
    title: 'Capac de canal lipsă',
    description: 'Gură de canal neacoperită pe Str. Elena Doamna.',
    reportedAt: hoursAgo(5),
  },
  {
    id: 'h5', kind: 'traffic_light', severity: 'medium', lat: 47.1559, lng: 27.6118,
    title: 'Semafor defect',
    description: 'Semaforul pentru pietoni nu funcționează la intersecția cu Bd. Tudor Vladimirescu.',
    reportedAt: hoursAgo(3),
  },
  {
    id: 'h6', kind: 'lighting', severity: 'low', lat: 47.1452, lng: 27.5702,
    title: 'Iluminat public nefuncțional',
    description: 'Mai mulți stâlpi stinși pe Șos. Nicolina, tronson de ~300 m.',
    reportedAt: hoursAgo(48),
  },
  {
    id: 'h7', kind: 'pothole', severity: 'medium', lat: 47.1745, lng: 27.5498,
    title: 'Gropi multiple',
    description: 'Asfalt deteriorat pe Str. Păcurari, lângă stația de tramvai.',
    reportedAt: hoursAgo(96),
  },
]

export const mockConstructionZones: ConstructionZone[] = [
  {
    id: 'c1',
    title: 'Modernizare linie de tramvai',
    description: 'Lucrări la calea de rulare, circulație restricționată pe o bandă.',
    polygon: [
      [47.1648, 27.5585], [47.1662, 27.5592], [47.1700, 27.5510], [47.1688, 27.5500],
    ],
    startDate: '2026-08-01', endDate: '2026-12-15', contractor: 'Primăria Municipiului Iași',
  },
  {
    id: 'c2',
    title: 'Reabilitare pasaj Podu Roș',
    description: 'Hidroizolație și refacere carosabil. Ocolire recomandată prin Str. Sf. Andrei.',
    polygon: [
      [47.1540, 27.5905], [47.1545, 27.5952], [47.1515, 27.5960], [47.1510, 27.5912],
    ],
    startDate: '2026-09-10', endDate: '2027-03-01', contractor: 'CNAIR / PMI',
  },
  {
    id: 'c3',
    title: 'Rețea de termoficare',
    description: 'Înlocuire conducte, trotuar închis pe partea stângă.',
    polygon: [
      [47.1702, 27.5990], [47.1712, 27.6050], [47.1700, 27.6055], [47.1690, 27.5995],
    ],
    startDate: '2026-10-01', endDate: '2026-11-30',
  },
  {
    id: 'c4',
    title: 'Lărgire Bd. Chimiei',
    description: 'Lucrări de lărgire la 4 benzi, trafic deviat.',
    polygon: [
      [47.1425, 27.6110], [47.1440, 27.6205], [47.1425, 27.6212], [47.1410, 27.6118],
    ],
    startDate: '2026-06-15', endDate: '2027-06-30',
  },
]

export const mockIssues: UserIssue[] = [
  {
    id: 'i1',
    title: 'Fum de la ardere de deșeuri',
    description: 'Miros puternic de plastic ars, probabil de la o groapă de gunoi improvizată.',
    category: 'pollution', severity: 'high',
    lat: 47.1405, lng: 27.5770, radius: 500,
    createdBy: 'user-demo-1', createdAt: hoursAgo(2), resolveVotes: [], source: 'chat',
  },
  {
    id: 'i2',
    title: 'Copac căzut pe trotuar',
    description: 'Un copac a căzut după furtună și blochează trotuarul și o parte din pista de biciclete.',
    category: 'obstruction', severity: 'medium',
    lat: 47.1768, lng: 27.5705, radius: 500,
    createdBy: 'user-demo-2', createdAt: hoursAgo(6), resolveVotes: ['user-demo-3'], source: 'chat',
  },
  {
    id: 'i3',
    title: 'Trafic blocat – accident',
    description: 'Coliziune între două mașini, o bandă blocată.',
    category: 'traffic', severity: 'medium',
    lat: 47.1593, lng: 27.6255, radius: 500,
    createdBy: 'user-demo-1', createdAt: hoursAgo(1), resolveVotes: [], source: 'manual',
  },
]
