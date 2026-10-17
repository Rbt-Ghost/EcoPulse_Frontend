import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Crosshair, Flag, MapPin } from 'lucide-react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  Circle,
  MapContainer,
  Marker,
  Polygon,
  Polyline,
  Popup,
  Rectangle,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import { IASI_BOUNDS, IASI_CENTER } from '../data/iasi'
import type { LatLng, MapData, RouteResult } from '../types'
import { aqiAt, aqiBand, aqiColor, polygonCenter, timeAgo } from '../utils/geo'
import { IssuePopup } from './IssuePopup'
import {
  constructionIcon,
  endpointIcon,
  hazardIcon,
  issueIcon,
  sensorIcon,
  userIcon,
} from './mapIcons'
import { routeDrawOrder, type MapFocus, type MapViewProps } from './mapTypes'
import { ROUTE_MODES } from './routeModes'

const renderer = L.canvas({ padding: 0.5 })

// Tile-uri configurabile (ex. un furnizor cu cheie API în producție).
const TILE_URL: string =
  import.meta.env.VITE_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION: string =
  import.meta.env.VITE_TILE_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

function PollutionGrid({ data }: { data: MapData }) {
  const cells = useMemo(() => {
    const [[s, w], [n, e]] = IASI_BOUNDS
    const rows = 44
    const cols = 56
    const dLat = (n - s) / rows
    const dLng = (e - w) / cols
    const out: { b: [[number, number], [number, number]]; color: string }[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lat = s + r * dLat
        const lng = w + c * dLng
        const aqi = aqiAt({ lat: lat + dLat / 2, lng: lng + dLng / 2 }, data.sensors)
        out.push({ b: [[lat, lng], [lat + dLat, lng + dLng]], color: aqiColor(aqi) })
      }
    }
    return out
  }, [data.sensors])

  return (
    <>
      {cells.map((cell, i) => (
        <Rectangle
          key={i}
          bounds={cell.b}
          pathOptions={{ stroke: false, fillColor: cell.color, fillOpacity: 0.26 }}
          renderer={renderer}
          interactive={false}
        />
      ))}
    </>
  )
}

function FocusController({ focus }: { focus: MapFocus | null }) {
  const map = useMap()
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], focus.zoom ?? 16, { duration: 0.9 })
  }, [focus, map])
  return null
}

function FitRoutes({ routes }: { routes: RouteResult | null }) {
  const map = useMap()
  useEffect(() => {
    if (!routes) return
    const all = Object.values(routes).flatMap((r) => r.coords)
    if (!all.length) return
    const isMobile = window.innerWidth < 860
    map.fitBounds(L.latLngBounds(all), {
      paddingTopLeft: [40, 80],
      paddingBottomRight: [40, isMobile ? 280 : 60],
      maxZoom: 16,
    })
  }, [routes, map])
  return null
}

function PlacePicker({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

function ClickPicker({ onPick }: { onPick: (which: 'from' | 'to', p: LatLng) => void }) {
  const [point, setPoint] = useState<LatLng | null>(null)
  const map = useMapEvents({
    click(e) {
      setPoint({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  if (!point) return null
  const pick = (which: 'from' | 'to') => {
    onPick(which, point)
    setPoint(null)
    map.closePopup()
  }
  return (
    <Popup position={[point.lat, point.lng]} eventHandlers={{ remove: () => setPoint(null) }}>
      <div
        className="pick-popup"
        ref={(el) => {
          // altfel click-ul pe buton ajunge și la hartă și redeschide selectorul
          if (el) L.DomEvent.disableClickPropagation(el)
        }}
      >
        <button className="pick-btn" onClick={() => pick('from')}>
          <MapPin size={15} /> Pornește de aici
        </button>
        <button className="pick-btn dest" onClick={() => pick('to')}>
          <Flag size={15} /> Mergi până aici
        </button>
      </div>
    </Popup>
  )
}

function LocateButton({ position, hasGps }: { position: LatLng; hasGps: boolean }) {
  const map = useMap()
  return (
    <button
      className="map-fab locate"
      title={hasGps ? 'Centrează pe locația mea' : 'Centrează pe Iași'}
      aria-label="Centrează harta pe locația mea"
      onClick={() => map.flyTo([position.lat, position.lng], hasGps ? 16 : 13, { duration: 0.8 })}
    >
      <Crosshair size={18} />
    </button>
  )
}

export default function LeafletMapView(props: MapViewProps) {
  const { data, layers, routes, mode } = props
  const drawOrder = routeDrawOrder(mode)

  return (
    <MapContainer
      center={[IASI_CENTER.lat, IASI_CENTER.lng]}
      zoom={13}
      minZoom={11}
      maxBounds={[
        [IASI_BOUNDS[0][0] - 0.15, IASI_BOUNDS[0][1] - 0.2],
        [IASI_BOUNDS[1][0] + 0.15, IASI_BOUNDS[1][1] + 0.2],
      ]}
      zoomControl={false}
      className="map"
    >
      <TileLayer
        attribution={TILE_ATTRIBUTION}
        url={TILE_URL}
        maxZoom={19}
        className="base-tiles"
      />

      <FocusController focus={props.focus} />
      <FitRoutes routes={routes} />
      {props.onPlacePick ? (
        <PlacePicker onPick={props.onPlacePick} />
      ) : (
        props.onPickPoint && <ClickPicker onPick={props.onPickPoint} />
      )}
      {props.draftPin && (
        <Marker position={[props.draftPin.lat, props.draftPin.lng]} icon={issueIcon('other', true, true)} zIndexOffset={1100} />
      )}
      <LocateButton position={props.userPosition} hasGps={props.hasGps} />

      {data && layers.pollution && <PollutionGrid data={data} />}

      {data && layers.construction &&
        data.constructionZones.map((z) => {
          const c = polygonCenter(z.polygon)
          return (
            <Fragment key={z.id}>
              <Polygon
                positions={z.polygon}
                pathOptions={{ color: '#d97706', weight: 2.5, dashArray: '7 6', fillColor: '#f59e0b', fillOpacity: 0.28 }}
              />
              <Marker position={[c.lat, c.lng]} icon={constructionIcon()}>
                <Popup>
                  <div className="popup">
                    <span className="popup-tag construction">Zonă în construcție</span>
                    <h4>{z.title}</h4>
                    <p>{z.description}</p>
                    <div className="popup-meta">
                      {z.startDate && z.endDate
                        ? `${new Date(z.startDate).toLocaleDateString('ro-RO')} – ${new Date(z.endDate).toLocaleDateString('ro-RO')} · `
                        : ''}
                      sursă: {z.source}
                      {z.contractor && <> · {z.contractor}</>}
                    </div>
                  </div>
                </Popup>
              </Marker>
            </Fragment>
          )
        })}

      {routes &&
        drawOrder.map((m) => {
          const r = routes[m]
          const active = m === mode
          const color = ROUTE_MODES[m].color
          return (
            <Fragment key={`${m}-${r.id}`}>
              {active && (
                <Polyline positions={r.coords} pathOptions={{ color: '#fff', weight: 11, opacity: 0.95 }} interactive={false} />
              )}
              <Polyline
                positions={r.coords}
                pathOptions={{
                  color: active ? color : '#64748b',
                  weight: active ? 6 : 5,
                  opacity: active ? 1 : 0.45,
                  dashArray: active ? undefined : '2 9',
                  lineCap: 'round',
                }}
                eventHandlers={{ click: () => props.onModeChange(m) }}
              />
            </Fragment>
          )
        })}

      {data && layers.hazards &&
        data.hazards.map((h) => (
          <Marker key={h.id} position={[h.lat, h.lng]} icon={hazardIcon(h.kind, h.severity)}>
            <Popup>
              <div className="popup">
                <span className={`popup-tag hazard sev-${h.severity}`}>Hazard infrastructură</span>
                <h4>{h.title}</h4>
                <p>{h.description}</p>
                <div className="popup-meta">Semnalat {timeAgo(h.reportedAt)} · sursă: {h.source}</div>
              </div>
            </Popup>
          </Marker>
        ))}

      {data && layers.issues &&
        data.issues.map((iss) => {
          const mine = iss.mine
          return (
            <Fragment key={iss.id}>
              <Circle
                center={[iss.lat, iss.lng]}
                radius={iss.radius}
                pathOptions={{
                  color: mine ? '#2563eb' : '#7c3aed',
                  weight: 1.5,
                  dashArray: '4 6',
                  fillColor: mine ? '#3b82f6' : '#8b5cf6',
                  fillOpacity: 0.1,
                }}
                interactive={false}
              />
              <Marker
                position={[iss.lat, iss.lng]}
                icon={issueIcon(iss.category, mine, iss.id === props.freshIssueId)}
                zIndexOffset={500}
              >
                <Popup minWidth={260}>
                  <IssuePopup
                    issue={iss}
                    onAction={props.onIssueAction}
                  />
                </Popup>
              </Marker>
            </Fragment>
          )
        })}

      {data && layers.pollution &&
        data.sensors.map((s) => (
          <Marker key={s.id} position={[s.lat, s.lng]} icon={sensorIcon(s.aqi)}>
            <Popup>
              <div className="popup">
                <span className="popup-tag" style={{ background: aqiBand(s.aqi).color }}>
                  {aqiBand(s.aqi).label}
                </span>
                <h4>Senzor · {s.name}</h4>
                <div className="sensor-grid">
                  <div><b>{s.aqi}</b><span>AQI</span></div>
                  <div><b>{s.pm25 ?? '–'}</b><span>PM2.5 µg/m³</span></div>
                  <div><b>{s.pm10 ?? '–'}</b><span>PM10 µg/m³</span></div>
                  <div><b>{s.no2 ?? '–'}</b><span>NO₂ µg/m³</span></div>
                </div>
                <div className="popup-meta">Actualizat {timeAgo(s.updatedAt)} · {s.source}</div>
              </div>
            </Popup>
          </Marker>
        ))}

      {props.hasGps && (
        <Marker position={[props.userPosition.lat, props.userPosition.lng]} icon={userIcon()} zIndexOffset={900} />
      )}
      {props.from && <Marker position={[props.from.lat, props.from.lng]} icon={endpointIcon('start')} zIndexOffset={1000} />}
      {props.to && <Marker position={[props.to.lat, props.to.lng]} icon={endpointIcon('end')} zIndexOffset={1000} />}
    </MapContainer>
  )
}
