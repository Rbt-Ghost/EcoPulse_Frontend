import {
  AlertTriangle,
  ArrowUpDown,
  Bike,
  Car,
  ExternalLink,
  Footprints,
  Info,
  MousePointerClick,
  Wind,
} from 'lucide-react'
import type { MapData, RouteMode, RoutePlace, RouteResult, TravelProfile } from '../types'
import { aqiBand, formatDistance, formatDuration } from '../utils/geo'
import { PlaceInput } from './PlaceInput'
import { MODE_ORDER, ROUTE_MODES } from './routeModes'

type Props = {
  data: MapData | null
  from: RoutePlace | null
  to: RoutePlace | null
  onFromChange: (p: RoutePlace | null) => void
  onToChange: (p: RoutePlace | null) => void
  onSwap: () => void
  onUseMyLocation: () => void
  profile: TravelProfile
  onProfileChange: (p: TravelProfile) => void
  mode: RouteMode
  onModeChange: (m: RouteMode) => void
  routes: RouteResult | null
  loading: boolean
  error: string | null
  onRetry: () => void
  onExport: () => void
}

const PROFILES: { id: TravelProfile; label: string; icon: typeof Footprints }[] = [
  { id: 'foot', label: 'Pe jos', icon: Footprints },
  { id: 'bike', label: 'Bicicletă', icon: Bike },
  { id: 'car', label: 'Mașină', icon: Car },
]

function Insight({ routes }: { routes: RouteResult }) {
  const { cleanest, fastest } = routes
  if (cleanest.id === fastest.id) {
    return (
      <div className="insight good">
        <Wind size={16} />
        <span>Vești bune: cel mai rapid traseu este și cel mai puțin poluat.</span>
      </div>
    )
  }
  const saved = Math.round((1 - cleanest.exposure / fastest.exposure) * 100)
  const extra = Math.max(1, Math.round((cleanest.duration - fastest.duration) / 60))
  const avoided = fastest.obstacles - cleanest.obstacles
  return (
    <div className="insight">
      <Wind size={16} />
      {saved >= 1 ? (
        <span>
          Traseul curat reduce expunerea la poluare cu <b>{saved}%</b>
          {avoided > 0 && <> și ocolește <b>{avoided} {avoided === 1 ? 'obstacol' : 'obstacole'}</b></>}, pentru
          doar <b>+{extra} min</b>.
        </span>
      ) : avoided > 0 ? (
        <span>
          Traseul curat ocolește <b>{avoided} {avoided === 1 ? 'obstacol' : 'obstacole'}</b> de pe ruta rapidă, pentru{' '}
          <b>+{extra} min</b>.
        </span>
      ) : (
        <span>Calitatea aerului este similară pe toate traseele – alege după timp.</span>
      )}
    </div>
  )
}

export function RoutePlanner(props: Props) {
  const { data, routes, mode, loading } = props
  const ready = props.from && props.to
  const avgCity = data ? Math.round(data.sensors.reduce((s, x) => s + x.aqi, 0) / data.sensors.length) : null

  return (
    <div className="panel-body">
      <header className="panel-header">
        <div>
          <h1>Planifică traseul</h1>
          <p>Rute calculate după calitatea aerului și obstacolele din Iași.</p>
        </div>
      </header>

      <section className="card route-inputs">
        <PlaceInput
          kind="from"
          value={props.from}
          placeholder="Punct de plecare"
          onChange={props.onFromChange}
          onUseMyLocation={props.onUseMyLocation}
        />
        <PlaceInput kind="to" value={props.to} placeholder="Destinație" onChange={props.onToChange} />
        <button className="swap-btn" onClick={props.onSwap} aria-label="Inversează plecarea și destinația" title="Inversează">
          <ArrowUpDown size={16} />
        </button>
        <div className="route-connector" aria-hidden />
      </section>

      <div className="segmented" role="radiogroup" aria-label="Mijloc de deplasare">
        {PROFILES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="radio"
            aria-checked={props.profile === id}
            className={props.profile === id ? 'active' : ''}
            onClick={() => props.onProfileChange(id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {!ready && (
        <div className="hint-card">
          <MousePointerClick size={18} />
          <span>Caută o adresă sau apasă oriunde pe hartă pentru a seta plecarea și destinația.</span>
        </div>
      )}

      {ready && (
        <section className="modes" role="radiogroup" aria-label="Tip traseu">
          {MODE_ORDER.map((m) => {
            const cfg = ROUTE_MODES[m]
            const r = routes?.[m]
            const Icon = cfg.icon
            const band = r ? aqiBand(r.avgAqi) : null
            return (
              <button
                key={m}
                role="radio"
                aria-checked={mode === m}
                className={`mode-card${mode === m ? ' active' : ''}`}
                style={{ '--mode': cfg.color } as React.CSSProperties}
                onClick={() => props.onModeChange(m)}
              >
                <span className="mode-icon">
                  <Icon size={18} />
                </span>
                <span className="mode-text">
                  <strong>{cfg.label}</strong>
                  <small>{cfg.hint}</small>
                </span>
                {loading && <span className="skeleton mode-skel" />}
                {!loading && r && (
                  <span className="mode-stats">
                    <strong>{formatDuration(r.duration)}</strong>
                    <small>{formatDistance(r.distance)}</small>
                  </span>
                )}
                {!loading && r && band && (
                  <span className="mode-foot">
                    <span className="aqi-chip" style={{ '--c': band.color } as React.CSSProperties}>
                      AQI mediu {Math.round(r.avgAqi)}
                    </span>
                    {m === 'balanced' && routes && r.id !== routes.fastest.id && r.id === routes.cleanest.id && (
                      <span className="obstacle-chip ok">identic cu traseul curat</span>
                    )}
                    {m === 'balanced' && routes && r.id === routes.fastest.id && r.id !== routes.cleanest.id && (
                      <span className="obstacle-chip ok">identic cu traseul rapid</span>
                    )}
                    {r.obstacles > 0 ? (
                      <span className="obstacle-chip">
                        <AlertTriangle size={12} /> {r.obstacles} {r.obstacles === 1 ? 'obstacol' : 'obstacole'}
                      </span>
                    ) : (
                      <span className="obstacle-chip ok">fără obstacole</span>
                    )}
                  </span>
                )}
              </button>
            )
          })}
        </section>
      )}

      {props.error && (
        <div className="error-card" role="alert">
          <AlertTriangle size={16} />
          <span>{props.error}</span>
          <button className="btn btn-sm btn-ghost" onClick={props.onRetry}>
            Reîncearcă
          </button>
        </div>
      )}

      {routes && !loading && <Insight routes={routes} />}

      {ready && (
        <button className="btn btn-gmaps" disabled={!routes || loading} onClick={props.onExport}>
          <img src="https://www.gstatic.com/images/branding/product/2x/maps_96dp.png" alt="" width={20} height={20} />
          Export în Google Maps
          <ExternalLink size={15} className="muted" />
        </button>
      )}

      {data && (
        <section className="city-stats">
          <h2>Iași acum</h2>
          <div className="stats-grid">
            <div className="stat">
              <span className="stat-dot" style={{ background: aqiBand(avgCity!).color }} />
              <b>{avgCity}</b>
              <small>AQI mediu · {aqiBand(avgCity!).label.toLowerCase()}</small>
            </div>
            <div className="stat">
              <span className="stat-dot hazard" />
              <b>{data.hazards.length}</b>
              <small>hazard-uri infrastructură</small>
            </div>
            <div className="stat">
              <span className="stat-dot construction" />
              <b>{data.constructionZones.length}</b>
              <small>zone în construcție</small>
            </div>
            <div className="stat">
              <span className="stat-dot issue" />
              <b>{data.issues.length}</b>
              <small>probleme raportate</small>
            </div>
          </div>
          <p className="footnote">
            <Info size={13} /> Apasă pe un marker de pe hartă pentru detalii. Problemele raportate pot fi eliminate când se rezolvă.
          </p>
        </section>
      )}
    </div>
  )
}
