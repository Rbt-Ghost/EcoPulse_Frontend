import { ChevronRight, RefreshCw, TriangleAlert, Wind, X } from 'lucide-react'
import { lazy, Suspense, useMemo, useState } from 'react'
import type { AirQuality, AirQualityHour, AirReading, RnmcaPollutant } from '../types'
import { CodeChip } from './AirQualityChip'
import { fmtValue, POLLUTANT_NAMES, RNMCA_LEVELS, UNIT } from './airQualityMeta'

// Recharts e mare: graficul se încarcă abia când se deschide panoul.
const ForecastChart = lazy(() => import('./AirQualityChart'))

const HOUR = 3_600_000

type Props = {
  data: AirQuality | null
  error: string | null
  loading: boolean
  open: boolean
  onToggle: () => void
  onRetry: () => void
}

// ------------------------------------------------------------------ timp

function formatter(timeZone: string, options: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat('ro-RO', { timeZone, ...options })
  } catch {
    return new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', ...options })
  }
}

function useClock(timeZone: string) {
  return useMemo(() => {
    const hour = formatter(timeZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    const day = formatter(timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' })
    return {
      hour: (iso: string) => hour.format(new Date(iso)),
      day: (iso: string) => day.format(new Date(iso)),
    }
  }, [timeZone])
}

/** Cele 24 de ore care încep cu ora citirii curente. */
function next24h(hours: AirQualityHour[], anchor: string | null, now = Date.now()): AirQualityHour[] {
  const ref = anchor && !Number.isNaN(Date.parse(anchor)) ? Date.parse(anchor) : now
  const start = Math.floor(ref / HOUR) * HOUR
  return hours
    .filter((h) => {
      const t = Date.parse(h.time)
      return t >= start && t < start + 24 * HOUR
    })
    .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
}

// ------------------------------------------------------------------ piese mici

function ReadingRow({ name, reading }: { name: string; reading: AirReading }) {
  return (
    <li className="aq-reading">
      <span className="aq-reading-name">{name}</span>
      <span className="aq-reading-value">
        <b>{fmtValue(reading.value)}</b> <small>{UNIT}</small>
      </span>
      <span className="aq-reading-level">
        <CodeChip code={reading.code} size="sm" />
        {reading.label}
      </span>
    </li>
  )
}

function HourStrip({ hours, hour }: { hours: AirQualityHour[]; hour: (iso: string) => string }) {
  return (
    <div className="aq-strip" aria-hidden>
      {hours.map((h) => {
        const level = RNMCA_LEVELS[h.code]
        return (
          <span
            key={h.time}
            className="aq-strip-cell"
            style={{ background: level.color, color: level.ink }}
            title={`${hour(h.time)} · ${h.code ? `nivel ${h.code}, ` : ''}${h.label}`}
          >
            {h.code || '?'}
          </span>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------------ panou

export function AirQualitySidebar({ data, error, loading, open, onToggle, onRetry }: Props) {
  const [pollutant, setPollutant] = useState<RnmcaPollutant>('pm25')
  const clock = useClock(data?.timezone ?? 'Europe/Bucharest')
  const hours = useMemo(() => (data ? next24h(data.hours, data.updatedAt) : []), [data])

  if (!open) {
    const code = data?.overall.code ?? 0
    return (
      <aside className="aq closed" aria-label="Calitatea aerului">
        <button className="aq-toggle" onClick={onToggle} aria-expanded={false} aria-controls="aq-panel">
          <Wind size={18} />
          {data ? <CodeChip code={code} /> : <span className="aq-chip md pending" aria-hidden />}
          <span className="aq-toggle-label">
            Aer 24h
            {data && <small>{data.overall.label}</small>}
          </span>
          {data?.alert && <TriangleAlert size={16} className="aq-toggle-alert" aria-label="Alertă de poluare" />}
        </button>
      </aside>
    )
  }

  const today = clock.day(new Date().toISOString())
  const peak = hours.reduce<AirQualityHour | null>((best, h) => {
    const v = h[pollutant]
    return v !== null && (best === null || v > (best[pollutant] ?? -1)) ? h : best
  }, null)
  const worsening = data && !data.alert ? hours.find((h) => h.pm25Code >= 3) : undefined

  return (
    <aside className="aq open" id="aq-panel" aria-label="Calitatea aerului">
      <header className="aq-header">
        <div>
          <h2>Calitatea aerului</h2>
          <p>Iași · prognoză pe următoarele 24 de ore</p>
        </div>
        <button className="aq-close" onClick={onToggle} aria-expanded aria-controls="aq-panel" aria-label="Închide panoul calității aerului">
          <ChevronRight size={18} className="desktop-only" />
          <X size={18} className="mobile-only" />
        </button>
      </header>

      <div className={`aq-body${loading && data ? ' refreshing' : ''}`}>
        {!data ? (
          error ? (
            <div className="aq-empty">
              <p>{error}</p>
              <button className="btn btn-sm btn-soft" onClick={onRetry}>
                <RefreshCw size={14} /> Încearcă din nou
              </button>
            </div>
          ) : (
            <div className="aq-empty">
              <span className="pulse" /> Se încarcă datele CAMS…
            </div>
          )
        ) : (
          <>
            {data.alert && (
              <div className="aq-alert" role="alert">
                <TriangleAlert size={18} />
                <div>
                  <b>Alertă: PM2.5 la nivel „{data.pm25.label}”</b>
                  <p>{data.pm25.recommendation}</p>
                </div>
              </div>
            )}
            {worsening && (
              <div className="aq-alert soft" role="status">
                <TriangleAlert size={18} />
                <div>
                  <b>
                    PM2.5 urcă la „{worsening.pm25Label}” în jurul orei {clock.hour(worsening.time)}
                    {clock.day(worsening.time) !== today ? ' (mâine)' : ''}
                  </b>
                  <p>Planifică deplasările lungi pe jos sau cu bicicleta înainte de această oră.</p>
                </div>
              </div>
            )}

            <section className="aq-now" aria-label="Acum">
              <CodeChip code={data.overall.code} size="lg" />
              <div>
                <span className="aq-eyebrow">
                  Acum{data.updatedAt ? ` · ${clock.hour(data.updatedAt)}` : ''}
                </span>
                <strong className="aq-now-label">{data.overall.label}</strong>
                <span className="aq-now-sub">
                  Indice RNMCA {data.overall.code ? `${data.overall.code}/6` : '–'}
                  {data.overall.pollutant && ` · determinat de ${POLLUTANT_NAMES[data.overall.pollutant]}`}
                </span>
              </div>
            </section>
            {data.overall.recommendation && <p className="aq-advice">{data.overall.recommendation}</p>}

            <ul className="aq-readings">
              <ReadingRow name="PM2.5" reading={data.pm25} />
              <ReadingRow name="PM10" reading={data.pm10} />
              <ReadingRow name="NO₂" reading={data.no2} />
            </ul>
            <dl className="aq-extra">
              <div>
                <dt>O₃</dt>
                <dd>
                  {fmtValue(data.o3)} <small>{UNIT}</small>
                </dd>
              </div>
              <div>
                <dt>SO₂</dt>
                <dd>
                  {fmtValue(data.so2)} <small>{UNIT}</small>
                </dd>
              </div>
              <div>
                <dt>Indice european</dt>
                <dd>{data.europeanAqi === null ? '–' : Math.round(data.europeanAqi)}</dd>
              </div>
            </dl>

            <section className="aq-forecast" aria-label="Prognoză orară">
              <div className="aq-section-head">
                <h3>Prognoză 24 h</h3>
                <div className="aq-seg" role="group" aria-label="Poluant afișat">
                  {(Object.keys(POLLUTANT_NAMES) as RnmcaPollutant[]).map((p) => (
                    <button key={p} className={pollutant === p ? 'on' : ''} aria-pressed={pollutant === p} onClick={() => setPollutant(p)}>
                      {POLLUTANT_NAMES[p]}
                    </button>
                  ))}
                </div>
              </div>

              {hours.length === 0 ? (
                <p className="aq-muted">Prognoza orară nu e disponibilă momentan.</p>
              ) : (
                <>
                  <p className="aq-chart-title">
                    {POLLUTANT_NAMES[pollutant]} · {UNIT}
                    {peak && (
                      <span>
                        {' '}
                        · maxim <b>{fmtValue(peak[pollutant])}</b> la {clock.hour(peak.time)}
                        {clock.day(peak.time) !== today ? ' (mâine)' : ''}
                      </span>
                    )}
                  </p>
                  <Suspense fallback={<div className="aq-chart-placeholder" />}>
                    <ForecastChart hours={hours} pollutant={pollutant} hour={clock.hour} />
                  </Suspense>
                  <div className="aq-strip-head">
                    <span>Indice general pe ore</span>
                    <span>
                      {clock.hour(hours[0].time)} → {clock.hour(hours[hours.length - 1].time)}
                    </span>
                  </div>
                  <HourStrip hours={hours} hour={clock.hour} />

                  <details className="aq-table">
                    <summary>Tabel orar</summary>
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Ora</th>
                          <th scope="col">PM2.5</th>
                          <th scope="col">PM10</th>
                          <th scope="col">NO₂</th>
                          <th scope="col">Indice</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hours.map((h) => (
                          <tr key={h.time}>
                            <th scope="row">
                              {clock.hour(h.time)}
                              {clock.day(h.time) !== today && <small> mâine</small>}
                            </th>
                            <td>{fmtValue(h.pm25)}</td>
                            <td>{fmtValue(h.pm10)}</td>
                            <td>{fmtValue(h.no2)}</td>
                            <td>
                              <span className="aq-level-cell">
                                <CodeChip code={h.code} size="sm" /> {h.label}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </>
              )}
            </section>

            {error && (
              <p className="aq-stale">
                Nu am putut actualiza datele; afișăm ultima prognoză primită.{' '}
                <button onClick={onRetry}>Reîncearcă</button>
              </p>
            )}

            <p className="aq-source">
              Sursa: {data.source} (
              <a href={data.licenseUrl} target="_blank" rel="noreferrer">
                {data.license}
              </a>
              ). Scara RNMCA 1–6 pe PM2.5, PM10, NO₂. Estimare regională (~11 km), nu o măsurătoare stradală.
            </p>
          </>
        )}
      </div>
    </aside>
  )
}
