import { CarFront, ChevronDown, Construction, Layers, MessageSquareWarning, TriangleAlert, Wind } from 'lucide-react'
import { useState } from 'react'
import type { LayerKey, LayerVisibility } from '../types'
import { AQI_BANDS } from '../utils/geo'
import { TRAFFIC_COLORS, TRAFFIC_LABELS } from '../utils/traffic'

const LAYERS: { key: LayerKey; label: string; icon: typeof Wind; cls: string }[] = [
  { key: 'pollution', label: 'Poluare', icon: Wind, cls: 'pollution' },
  { key: 'traffic', label: 'Trafic', icon: CarFront, cls: 'traffic' },
  { key: 'hazards', label: 'Hazard-uri', icon: TriangleAlert, cls: 'hazard' },
  { key: 'construction', label: 'Șantiere', icon: Construction, cls: 'construction' },
  { key: 'issues', label: 'Raportări', icon: MessageSquareWarning, cls: 'issue' },
]

type Props = {
  layers: LayerVisibility
  onToggle: (key: LayerKey) => void
  loading: boolean
}

export function MapOverlay({ layers, onToggle, loading }: Props) {
  const [legendOpen, setLegendOpen] = useState(() => window.innerWidth > 860)

  return (
    <>
      <div className="layer-bar" role="group" aria-label="Straturi hartă">
        <span className="layer-bar-title">
          <Layers size={15} />
        </span>
        {LAYERS.map(({ key, label, icon: Icon, cls }) => (
          <button
            key={key}
            className={`layer-chip ${cls}${layers[key] ? ' on' : ''}`}
            aria-pressed={layers[key]}
            onClick={() => onToggle(key)}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="map-loading">
          <span className="pulse" /> Se încarcă datele live…
        </div>
      )}

      <div className={`legend${legendOpen ? ' open' : ''}`}>
        <button className="legend-toggle" onClick={() => setLegendOpen((o) => !o)} aria-expanded={legendOpen}>
          Legendă <ChevronDown size={14} />
        </button>
        {legendOpen && (
          <div className="legend-body">
            <div className="legend-section">
              <span className="legend-label">Calitatea aerului (AQI)</span>
              <div className="aqi-scale">
                {AQI_BANDS.map((b) => (
                  <span key={b.label} style={{ background: b.color }} title={b.label} />
                ))}
              </div>
              <div className="aqi-scale-labels">
                <span>Bun</span>
                <span>Periculos</span>
              </div>
            </div>
            <div className="legend-section">
              <span className="legend-label">Trafic estimat la ora plecării</span>
              <ul className="legend-items traffic-legend">
                {(Object.keys(TRAFFIC_COLORS) as (keyof typeof TRAFFIC_COLORS)[]).map((b) => (
                  <li key={b}>
                    <span className="lg lg-traffic" style={{ background: TRAFFIC_COLORS[b] }} /> {TRAFFIC_LABELS[b]}
                  </li>
                ))}
              </ul>
            </div>
            <ul className="legend-items">
              <li><span className="lg lg-hazard" /> Hazard infrastructură</li>
              <li><span className="lg lg-construction" /> Zonă în construcție</li>
              <li><span className="lg lg-issue" /> Raportare utilizator (500 m)</li>
              <li><span className="lg lg-mine" /> Raportarea ta</li>
            </ul>
          </div>
        )}
      </div>
    </>
  )
}
