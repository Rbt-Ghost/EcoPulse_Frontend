import { CalendarClock, Clock, Info } from 'lucide-react'
import type { AirForecast, ForecastPollutant, RnmcaLevel } from '../types'
import { toLocalInput } from '../utils/geo'

/** Câte zile acoperă prognoza CAMS a backend-ului (FORECAST_DAYS). */
const FORECAST_DAYS = 3

/** Culori pentru indicele RNMCA 1–6. */
const RNMCA_COLORS: Record<RnmcaLevel['code'], string> = {
  1: '#22c55e',
  2: '#84cc16',
  3: '#eab308',
  4: '#f97316',
  5: '#ef4444',
  6: '#a21caf',
}

const POLLUTANTS: { key: ForecastPollutant; label: string }[] = [
  { key: 'pm25', label: 'PM2.5' },
  { key: 'pm10', label: 'PM10' },
  { key: 'no2', label: 'NO₂' },
  { key: 'o3', label: 'O₃' },
]

function formatWhen(value: string | Date) {
  return new Date(value).toLocaleString('ro-RO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function tomorrowAt(hour: number) {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(hour, 0, 0, 0)
  return d
}

type PickerProps = {
  /** `null` = plecare acum */
  value: Date | null
  onChange: (d: Date | null) => void
}

export function DeparturePicker({ value, onChange }: PickerProps) {
  const now = new Date()
  const max = new Date(now.getTime() + FORECAST_DAYS * 86400000)
  const presets = [
    { label: 'Peste 1 oră', date: new Date(now.getTime() + 3600000) },
    { label: 'Mâine 08:00', date: tomorrowAt(8) },
    { label: 'Mâine 17:00', date: tomorrowAt(17) },
  ]
  const later = () => onChange(value ?? presets[0].date)

  return (
    <section className="trip-options" aria-label="Ora plecării">
      <div className="segmented two" role="radiogroup" aria-label="Când pleci">
        <button role="radio" aria-checked={!value} className={!value ? 'active' : ''} onClick={() => onChange(null)}>
          <Clock size={16} /> Acum
        </button>
        <button role="radio" aria-checked={!!value} className={value ? 'active' : ''} onClick={later}>
          <CalendarClock size={16} /> Mai târziu
        </button>
      </div>
      {value && (
        <>
          <label className="field">
            <span>Ora plecării</span>
            <input
              type="datetime-local"
              value={toLocalInput(value)}
              min={toLocalInput(now)}
              max={toLocalInput(max)}
              onChange={(e) => {
                const d = new Date(e.target.value)
                if (!Number.isNaN(d.getTime())) onChange(d)
              }}
            />
          </label>
          <div className="chip-row">
            {presets.map((p) => (
              <button
                key={p.label}
                className={`chip${Math.abs(p.date.getTime() - value.getTime()) < 60000 ? ' on' : ''}`}
                onClick={() => onChange(p.date)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function LevelChip({ level }: { level: RnmcaLevel }) {
  return (
    <span className="aqi-chip" style={{ '--c': RNMCA_COLORS[level.code] } as React.CSSProperties}>
      {level.code} · {level.label}
    </span>
  )
}

type CardProps = {
  forecast: AirForecast | null
  loading: boolean
  /** Plecare în viitor: scorurile traseelor folosesc încă senzorii de acum */
  future: boolean
}

export function AirForecastCard({ forecast, loading, future }: CardProps) {
  if (loading) {
    return (
      <section className="card route-details" aria-busy="true">
        <span className="skeleton" style={{ height: 18, width: '60%' }} />
        <span className="skeleton" style={{ height: 14, width: '90%' }} />
      </section>
    )
  }
  if (!forecast) return null

  if (!forecast.available || !forecast.index) {
    return (
      <section className="card route-details forecast-card">
        <div className="route-details-head">
          <strong>Calitatea aerului prognozată</strong>
          <small>{formatWhen(forecast.window.start)}</small>
        </div>
        <p>
          {forecast.status === 'beyond_forecast_horizon'
            ? `Prognoza CAMS acoperă doar până la ${formatWhen(forecast.horizonEnd)}. Revino mai aproape de plecare.`
            : 'Prognoza CAMS nu este disponibilă momentan. Lipsa datelor nu înseamnă aer curat.'}
        </p>
      </section>
    )
  }

  const { index, pollutants, hourly } = forecast
  return (
    <section className="card route-details forecast-card" style={{ '--c': RNMCA_COLORS[index.code] } as React.CSSProperties}>
      <div className="forecast-head">
        <div className="route-details-head">
          <strong>{future ? 'Aer prognozat pe traseu' : 'Aer prognozat acum'}</strong>
          <small>
            {formatWhen(forecast.window.start)} – {new Date(forecast.window.end).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })}
          </small>
        </div>
        <LevelChip level={index} />
      </div>
      <p className="forecast-advice">{index.recommendation}</p>

      <dl className="forecast-values">
        {POLLUTANTS.map(({ key, label }) => {
          const p = pollutants[key]
          if (!p) return null
          return (
            <div key={key} className={forecast.dominant === key ? 'dominant' : ''}>
              <dt>{label}</dt>
              <dd>
                {Math.round(p.max * 10) / 10}
                <small> µg/m³</small>
              </dd>
            </div>
          )
        })}
      </dl>

      {hourly.length > 1 && (
        <ol className="forecast-hours" aria-label="Prognoză pe ore">
          {hourly.map((h) => (
            <li
              key={h.time}
              style={{ '--c': h.index ? RNMCA_COLORS[h.index.code] : 'var(--border-strong)' } as React.CSSProperties}
              title={h.index ? `${h.index.label} · PM2.5 ${h.pm25 ?? '–'} µg/m³` : 'fără date'}
            >
              <span />
              <small>{new Date(h.time).toLocaleTimeString('ro-RO', { hour: '2-digit' })}</small>
            </li>
          ))}
        </ol>
      )}

      <p className="footnote">
        <Info size={13} />
        <span>
          Scara RNMCA, cea mai poluată oră din intervalul călătoriei. {forecast.limitation}
          {future && ' Culorile traseelor de mai sus folosesc senzorii de acum.'} Sursa: {forecast.attribution}.
        </span>
      </p>
    </section>
  )
}
