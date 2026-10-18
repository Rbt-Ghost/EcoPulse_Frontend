import type { RnmcaCode, RnmcaPollutant } from '../types'

// Scara RNMCA (1–6). Culorile sunt de stare, nu de serie: apar mereu împreună cu cifra și eticheta,
// pentru că verde-lime și galben se confundă la protanopie.
export const RNMCA_LEVELS: Record<RnmcaCode, { label: string; color: string; ink: string }> = {
  0: { label: 'Necunoscut', color: '#cbd5e1', ink: '#0f1f1d' },
  1: { label: 'Bun', color: '#15803d', ink: '#ffffff' },
  2: { label: 'Acceptabil', color: '#84cc16', ink: '#0f1f1d' },
  3: { label: 'Moderat', color: '#facc15', ink: '#0f1f1d' },
  4: { label: 'Rău', color: '#f97316', ink: '#0f1f1d' },
  5: { label: 'Foarte rău', color: '#b91c1c', ink: '#ffffff' },
  6: { label: 'Extrem de rău', color: '#86198f', ink: '#ffffff' },
}

/** Limita inferioară (µg/m³) a nivelurilor 2–6; aceleași praguri ca în backend (`AQI_THRESHOLDS`). */
export const RNMCA_THRESHOLDS: Record<RnmcaPollutant, [number, number, number, number, number]> = {
  pm25: [5, 15, 50, 90, 140],
  pm10: [15, 45, 120, 195, 270],
  no2: [10, 25, 60, 100, 150],
}

export const POLLUTANT_NAMES: Record<RnmcaPollutant, string> = {
  pm25: 'PM2.5',
  pm10: 'PM10',
  no2: 'NO₂',
}

export const UNIT = 'µg/m³'

export const fmtValue = (v: number | null) =>
  v === null ? '–' : v.toLocaleString('ro-RO', { maximumFractionDigits: 1 })
