import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AirQualityHour, RnmcaCode, RnmcaPollutant } from '../types'
import { CodeChip } from './AirQualityChip'
import { fmtValue, POLLUTANT_NAMES, RNMCA_LEVELS, RNMCA_THRESHOLDS, UNIT } from './airQualityMeta'

const LINE = '#0d9488'

type Point = { time: string; value: number | null; code: RnmcaCode; label: string }

function ChartTooltip({
  active,
  payload,
  hour,
  pollutant,
}: {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: unknown }>
  hour: (iso: string) => string
  pollutant: RnmcaPollutant
}) {
  const point = active && payload?.length ? (payload[0].payload as Point) : null
  if (!point) return null
  return (
    <div className="aq-tooltip">
      <div className="aq-tooltip-value">
        <span className="aq-line-key" />
        <b>{fmtValue(point.value)}</b> {UNIT}
      </div>
      <div className="aq-tooltip-meta">
        {POLLUTANT_NAMES[pollutant]} · ora {hour(point.time)}
      </div>
      <div className="aq-tooltip-meta">
        <CodeChip code={point.code} size="sm" /> {point.label}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ grafic

export default function ForecastChart({
  hours,
  pollutant,
  hour,
}: {
  hours: AirQualityHour[]
  pollutant: RnmcaPollutant
  hour: (iso: string) => string
}) {
  const levelOf = (h: AirQualityHour): Pick<Point, 'code' | 'label'> =>
    pollutant === 'pm25' ? { code: h.pm25Code, label: h.pm25Label } : classify(pollutant, h[pollutant])
  const points: Point[] = hours.map((h) => ({ time: h.time, value: h[pollutant], ...levelOf(h) }))
  const values = points.flatMap((p) => (p.value === null ? [] : [p.value]))
  const max = values.length ? Math.max(...values) : 0
  const thresholds = RNMCA_THRESHOLDS[pollutant]
  // Arătăm pragurile depășite și pe următorul, ca să se vadă cât e până la nivelul de deasupra.
  const nextUp = thresholds.find((t) => t > max) ?? thresholds[thresholds.length - 1]
  const shown = thresholds.filter((t) => t <= nextUp)
  // Axa urcă în cel mult 4 pași egali și rotunzi (5, 10, 20, 25, 50, 100 µg/m³).
  const raw = Math.max(nextUp, max) * 1.08
  const step = [5, 10, 20, 25, 50, 100].find((s) => Math.ceil(raw / s) <= 4) ?? 100
  const ticks = Array.from({ length: Math.ceil(raw / step) + 1 }, (_, i) => i * step)
  const top = ticks[ticks.length - 1]

  return (
    <div className="aq-chart" role="img" aria-label={`Prognoză ${POLLUTANT_NAMES[pollutant]} pe 24 de ore`}>
      <ResponsiveContainer width="100%" height={190}>
        <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="#e3e9e8" />
          <XAxis
            dataKey="time"
            tickFormatter={(t: string) => hour(t).slice(0, 2)}
            interval={2}
            tickLine={false}
            axisLine={{ stroke: '#d2dbda' }}
            tick={{ fill: '#83938f', fontSize: 11 }}
            minTickGap={4}
          />
          <YAxis
            domain={[0, top]}
            ticks={ticks}
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#83938f', fontSize: 11 }}
            width={40}
            allowDecimals={false}
          />
          {shown.map((t, i) => (
            <ReferenceLine
              key={t}
              y={t}
              stroke={RNMCA_LEVELS[(i + 2) as RnmcaCode].color}
              strokeWidth={1}
              ifOverflow="extendDomain"
              label={{
                value: RNMCA_LEVELS[(i + 2) as RnmcaCode].label,
                position: 'insideTopRight',
                fill: '#4b5d5a',
                fontSize: 10,
              }}
            />
          ))}
          <Tooltip
            cursor={{ stroke: '#83938f', strokeWidth: 1 }}
            content={(props) => (
              <ChartTooltip active={props.active} payload={props.payload} hour={hour} pollutant={pollutant} />
            )}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={LINE}
            strokeWidth={2}
            fill={LINE}
            fillOpacity={0.1}
            dot={false}
            activeDot={{ r: 4, fill: LINE, stroke: '#ffffff', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Nivelul RNMCA al unei concentrații (pentru PM10 și NO₂ pe ore; PM2.5 vine clasificat de backend). */
function classify(pollutant: RnmcaPollutant, value: number | null): Pick<Point, 'code' | 'label'> {
  if (value === null || value < 0) return { code: 0, label: RNMCA_LEVELS[0].label }
  const passed = RNMCA_THRESHOLDS[pollutant].filter((t) => value >= t).length
  const code = (passed + 1) as RnmcaCode
  return { code, label: RNMCA_LEVELS[code].label }
}
