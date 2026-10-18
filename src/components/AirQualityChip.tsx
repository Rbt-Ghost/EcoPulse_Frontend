import type { RnmcaCode } from '../types'
import { RNMCA_LEVELS } from './airQualityMeta'

/** Nivelul RNMCA ca pătrat colorat cu cifra (culoarea nu poartă singură sensul). */
export function CodeChip({ code, size = 'md' }: { code: RnmcaCode; size?: 'sm' | 'md' | 'lg' }) {
  const level = RNMCA_LEVELS[code]
  return (
    <span
      className={`aq-chip ${size}`}
      style={{ background: level.color, color: level.ink }}
      aria-label={code ? `Nivel ${code} din 6, ${level.label}` : 'Nivel necunoscut'}
    >
      {code || '?'}
    </span>
  )
}
