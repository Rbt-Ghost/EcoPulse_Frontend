import {
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
  APIProvider,
  InfoWindow,
  Map,
  useMap,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps'
import { Construction, Crosshair, Flag, MapPin } from 'lucide-react'
import { createElement, Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { IASI_BOUNDS, IASI_CENTER } from '../data/iasi'
import type { LatLng, MapData, PollutionSensor, RouteResult, UserIssue } from '../types'
import { aqiAt, aqiBand, aqiColor, polygonCenter, timeAgo } from '../utils/geo'
import { IssuePopup } from './IssuePopup'
import { HAZARD_ICONS, ISSUE_ICONS } from './markerMeta'
import {
  GOOGLE_MAPS_KEY,
  GOOGLE_MAPS_MAP_ID,
  routeDrawOrder,
  type MapFocus,
  type MapViewProps,
} from './mapTypes'
import { ROUTE_MODES } from './routeModes'

type Selected =
  | { kind: 'sensor' | 'hazard' | 'construction' | 'issue'; id: string }
  | { kind: 'pick'; lat: number; lng: number }

const [[SOUTH, WEST], [NORTH, EAST]] = IASI_BOUNDS
const toPath = (coords: [number, number][]) => coords.map(([lat, lng]) => ({ lat, lng }))

// ------------------------------------------------------------------ forme imperative
// @vis.gl/react-google-maps nu are componente pentru linii/poligoane/cercuri,
// așa că le creăm direct cu API-ul Google și le legăm de ciclul de viață React.

function useShape<T extends google.maps.MVCObject & { setMap(m: google.maps.Map | null): void }>(
  create: () => T,
  options: object,
  onClick?: () => void,
) {
  const map = useMap()
  const ref = useRef<T | null>(null)
  const createRef = useRef(create)

  useEffect(() => {
    if (!map) return
    const shape = createRef.current()
    shape.setMap(map)
    ref.current = shape
    return () => {
      shape.setMap(null)
      ref.current = null
    }
  }, [map])

  useEffect(() => {
    ref.current?.setValues(options)
  })

  useEffect(() => {
    const shape = ref.current
    if (!shape || !onClick) return
    const l = shape.addListener('click', onClick)
    return () => l.remove()
  })
}

function GPolyline(props: { options: google.maps.PolylineOptions; onClick?: () => void }) {
  useShape(() => new google.maps.Polyline(), props.options, props.onClick)
  return null
}

function GPolygon(props: { options: google.maps.PolygonOptions }) {
  useShape(() => new google.maps.Polygon(), props.options)
  return null
}

function GCircle(props: { options: google.maps.CircleOptions }) {
  useShape(() => new google.maps.Circle(), props.options)
  return null
}

const dashIcons = (color: string, repeat: string, scale = 2.5): google.maps.IconSequence[] => [
  {
    icon: { path: 'M 0,-1 0,1', strokeColor: color, strokeOpacity: 1, scale },
    offset: '0',
    repeat,
  },
]

const dotIcons = (color: string): google.maps.IconSequence[] => [
  {
    icon: { path: google.maps.SymbolPath.CIRCLE, fillColor: color, fillOpacity: 0.55, strokeOpacity: 0, scale: 2.6 },
    offset: '0',
    repeat: '11px',
  },
]

// ------------------------------------------------------------------ straturi

/** Heatmap de poluare: imagine generată pe canvas, întinsă peste Iași (netezită de browser). */
function PollutionOverlay({ sensors }: { sensors: PollutionSensor[] }) {
  const map = useMap()
  const url = useMemo(() => {
    const cols = 112
    const rows = 88
    const canvas = document.createElement('canvas')
    canvas.width = cols
    canvas.height = rows
    const ctx = canvas.getContext('2d')!
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const lat = NORTH - ((y + 0.5) / rows) * (NORTH - SOUTH)
        const lng = WEST + ((x + 0.5) / cols) * (EAST - WEST)
        ctx.fillStyle = aqiColor(aqiAt({ lat, lng }, sensors))
        ctx.fillRect(x, y, 1, 1)
      }
    }
    return canvas.toDataURL()
  }, [sensors])

  useEffect(() => {
    if (!map) return
    const overlay = new google.maps.GroundOverlay(
      url,
      { north: NORTH, south: SOUTH, east: EAST, west: WEST },
      { opacity: 0.32, clickable: false },
    )
    overlay.setMap(map)
    return () => overlay.setMap(null)
  }, [map, url])

  return null
}

function CameraController({ focus, routes }: { focus: MapFocus | null; routes: RouteResult | null }) {
  const map = useMap()

  useEffect(() => {
    if (!map || !focus) return
    map.panTo({ lat: focus.lat, lng: focus.lng })
    map.setZoom(focus.zoom ?? 16)
  }, [map, focus])

  useEffect(() => {
    if (!map || !routes) return
    const bounds = new google.maps.LatLngBounds()
    Object.values(routes).forEach((r) => r.coords.forEach(([lat, lng]) => bounds.extend({ lat, lng })))
    if (bounds.isEmpty()) return
    const isMobile = window.innerWidth < 860
    map.fitBounds(bounds, { top: 80, left: 40, right: 40, bottom: isMobile ? 280 : 60 })
  }, [map, routes])

  return null
}

function LocateButton({ position, hasGps }: { position: LatLng; hasGps: boolean }) {
  const map = useMap()
  return (
    <button
      className="map-fab locate"
      title={hasGps ? 'Centrează pe locația mea' : 'Centrează pe Iași'}
      aria-label="Centrează harta pe locația mea"
      onClick={() => {
        map?.panTo(position)
        map?.setZoom(hasGps ? 16 : 13)
      }}
    >
      <Crosshair size={18} />
    </button>
  )
}

// ------------------------------------------------------------------ hartă

function GoogleMapInner(props: MapViewProps) {
  const { data, layers, routes, mode } = props
  const [selected, setSelected] = useState<Selected | null>(null)
  const drawOrder = routeDrawOrder(mode)

  // Închidem fereastra de detalii dacă elementul selectat dispare sau stratul e ascuns.
  const selectedItem = useMemo(() => {
    if (!selected || !data || selected.kind === 'pick') return null
    switch (selected.kind) {
      case 'sensor':
        return layers.pollution ? data.sensors.find((s) => s.id === selected.id) ?? null : null
      case 'hazard':
        return layers.hazards ? data.hazards.find((h) => h.id === selected.id) ?? null : null
      case 'construction':
        return layers.construction ? data.constructionZones.find((z) => z.id === selected.id) ?? null : null
      case 'issue':
        return layers.issues ? data.issues.find((i) => i.id === selected.id) ?? null : null
    }
  }, [selected, data, layers])

  const onMapClick = (e: MapMouseEvent) => {
    // Oprim fereastra implicită Google pentru punctele de interes.
    if (e.detail.placeId) e.stop()
    if (props.onPlacePick && e.detail.latLng) {
      props.onPlacePick(e.detail.latLng)
      return
    }
    if (!props.onPickPoint || !e.detail.latLng) {
      setSelected(null)
      return
    }
    setSelected({ kind: 'pick', ...e.detail.latLng })
  }

  const pick = (which: 'from' | 'to') => {
    if (selected?.kind !== 'pick' || !props.onPickPoint) return
    props.onPickPoint(which, { lat: selected.lat, lng: selected.lng })
    setSelected(null)
  }

  const close = () => setSelected(null)

  return (
    <>
      <Map
        className="map"
        mapId={GOOGLE_MAPS_MAP_ID}
        defaultCenter={IASI_CENTER}
        defaultZoom={13}
        minZoom={11}
        gestureHandling="greedy"
        disableDefaultUI
        clickableIcons
        restriction={{
          latLngBounds: { north: NORTH + 0.15, south: SOUTH - 0.15, east: EAST + 0.2, west: WEST - 0.2 },
          strictBounds: false,
        }}
        onClick={onMapClick}
      >
        {/* Fără senzori nu desenăm nimic: un cache gol nu înseamnă aer curat. */}
        {data && layers.pollution && data.sensors.length > 0 && <PollutionOverlay sensors={data.sensors} />}

        {data && layers.construction &&
          data.constructionZones.map((z) => {
            const c = polygonCenter(z.polygon)
            const path = toPath(z.polygon)
            return (
              <Fragment key={z.id}>
                <GPolygon options={{ paths: path, strokeOpacity: 0, fillColor: '#f59e0b', fillOpacity: 0.28, clickable: false }} />
                <GPolyline
                  options={{ path: [...path, path[0]], strokeOpacity: 0, icons: dashIcons('#d97706', '12px', 2.2), clickable: false }}
                />
                <AdvancedMarker
                  position={c}
                  anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
                  title={z.title}
                  onClick={() => setSelected({ kind: 'construction', id: z.id })}
                >
                  <div className="mk-construction">
                    <Construction size={16} strokeWidth={2.4} />
                  </div>
                </AdvancedMarker>
              </Fragment>
            )
          })}

        {routes &&
          drawOrder.map((m) => {
            const r = routes[m]
            const active = m === mode
            const path = toPath(r.coords)
            return (
              <Fragment key={`${m}-${r.id}`}>
                {active && (
                  <GPolyline options={{ path, strokeColor: '#ffffff', strokeWeight: 11, strokeOpacity: 0.95, zIndex: 9, clickable: false }} />
                )}
                <GPolyline
                  options={
                    active
                      ? { path, strokeColor: ROUTE_MODES[m].color, strokeWeight: 6, strokeOpacity: 1, zIndex: 10, icons: [] }
                      : { path, strokeOpacity: 0, strokeWeight: 10, zIndex: 5, icons: dotIcons('#475569') }
                  }
                  onClick={() => props.onModeChange(m)}
                />
              </Fragment>
            )
          })}

        {data && layers.issues &&
          data.issues.map((iss) => {
            const mine = iss.mine
            return (
              <GCircle
                key={`c-${iss.id}`}
                options={{
                  center: { lat: iss.lat, lng: iss.lng },
                  radius: iss.radius,
                  strokeColor: mine ? '#2563eb' : '#7c3aed',
                  strokeWeight: 1.5,
                  strokeOpacity: 0.7,
                  fillColor: mine ? '#3b82f6' : '#8b5cf6',
                  fillOpacity: 0.1,
                  clickable: false,
                }}
              />
            )
          })}

        {data && layers.hazards &&
          data.hazards.map((h) => (
            <AdvancedMarker
              key={h.id}
              position={h}
              anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
              title={h.title}
              onClick={() => setSelected({ kind: 'hazard', id: h.id })}
            >
              <div className={`mk-hazard sev-${h.severity}`}>
                {createElement(HAZARD_ICONS[h.kind], { size: 15, strokeWidth: 2.4 })}
              </div>
            </AdvancedMarker>
          ))}

        {data && layers.issues &&
          data.issues.map((iss) => {
            const mine = iss.mine
            const fresh = iss.id === props.freshIssueId
            return (
              <AdvancedMarker
                key={iss.id}
                position={iss}
                zIndex={500}
                title={iss.title}
                onClick={() => setSelected({ kind: 'issue', id: iss.id })}
              >
                <div className={`mk-issue${mine ? ' mine' : ''}${fresh ? ' fresh' : ''}`}>
                  <div className="pin">{createElement(ISSUE_ICONS[iss.category], { size: 16, strokeWidth: 2.4 })}</div>
                </div>
              </AdvancedMarker>
            )
          })}

        {data && layers.pollution &&
          data.sensors.map((s) => (
            <AdvancedMarker
              key={s.id}
              position={s}
              anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
              title={`Senzor ${s.name}`}
              onClick={() => setSelected({ kind: 'sensor', id: s.id })}
            >
              <div className="mk-sensor" style={{ '--c': aqiBand(s.aqi).color } as React.CSSProperties}>
                <span>{s.aqi}</span>
              </div>
            </AdvancedMarker>
          ))}

        {props.hasGps && (
          <AdvancedMarker position={props.userPosition} anchorPoint={AdvancedMarkerAnchorPoint.CENTER} zIndex={900}>
            <div className="mk-user">
              <span />
            </div>
          </AdvancedMarker>
        )}
        {props.draftPin && (
          <AdvancedMarker position={props.draftPin} zIndex={1100}>
            <div className="mk-issue mine fresh">
              <div className="pin">
                <MapPin size={16} />
              </div>
            </div>
          </AdvancedMarker>
        )}
        {props.from && (
          <AdvancedMarker position={props.from} anchorPoint={AdvancedMarkerAnchorPoint.CENTER} zIndex={1000}>
            <div className="mk-endpoint start">A</div>
          </AdvancedMarker>
        )}
        {props.to && (
          <AdvancedMarker position={props.to} anchorPoint={AdvancedMarkerAnchorPoint.CENTER} zIndex={1000}>
            <div className="mk-endpoint end">B</div>
          </AdvancedMarker>
        )}

        {selected?.kind === 'pick' && (
          <InfoWindow position={selected} onCloseClick={close} headerDisabled className="gm-popup">
            <div className="pick-popup">
              <button className="pick-btn" onClick={() => pick('from')}>
                <MapPin size={15} /> Pornește de aici
              </button>
              <button className="pick-btn dest" onClick={() => pick('to')}>
                <Flag size={15} /> Mergi până aici
              </button>
            </div>
          </InfoWindow>
        )}

        {selected && selectedItem && selected.kind !== 'pick' && (
          <InfoWindow
            position={
              'polygon' in selectedItem ? polygonCenter(selectedItem.polygon) : { lat: selectedItem.lat, lng: selectedItem.lng }
            }
            pixelOffset={[0, selected.kind === 'issue' ? -44 : -18]}
            onCloseClick={close}
            className="gm-popup"
          >
            <SelectedContent
              selected={selected.kind}
              item={selectedItem}
              onAction={props.onIssueAction}
            />
          </InfoWindow>
        )}

        <CameraController focus={props.focus} routes={routes} />
      </Map>
      <LocateButton position={props.userPosition} hasGps={props.hasGps} />
    </>
  )
}

type Item = MapData['sensors'][number] | MapData['hazards'][number] | MapData['constructionZones'][number] | UserIssue

function SelectedContent(props: {
  selected: 'sensor' | 'hazard' | 'construction' | 'issue'
  item: Item
  onAction: MapViewProps['onIssueAction']
}) {
  const { selected, item } = props
  if (selected === 'issue') {
    return <IssuePopup issue={item as UserIssue} onAction={props.onAction} />
  }
  if (selected === 'sensor') {
    const s = item as PollutionSensor
    const band = aqiBand(s.aqi)
    return (
      <div className="popup">
        <span className="popup-tag" style={{ background: band.color }}>{band.label}</span>
        <h4>Senzor · {s.name}</h4>
        <div className="sensor-grid">
          <div><b>{s.aqi}</b><span>AQI</span></div>
          <div><b>{s.pm25 ?? '–'}</b><span>PM2.5 µg/m³</span></div>
          <div><b>{s.pm10 ?? '–'}</b><span>PM10 µg/m³</span></div>
          <div><b>{s.no2 ?? '–'}</b><span>NO₂ µg/m³</span></div>
        </div>
        <div className="popup-meta">Actualizat {timeAgo(s.updatedAt)} · {s.source}</div>
      </div>
    )
  }
  if (selected === 'hazard') {
    const h = item as MapData['hazards'][number]
    return (
      <div className="popup">
        <span className={`popup-tag hazard sev-${h.severity}`}>Hazard infrastructură</span>
        <h4>{h.title}</h4>
        <p>{h.description}</p>
        <div className="popup-meta">Semnalat {timeAgo(h.reportedAt)} · sursă: {h.source}</div>
      </div>
    )
  }
  const z = item as MapData['constructionZones'][number]
  return (
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
  )
}

export default function GoogleMapView(props: MapViewProps) {
  return (
    <APIProvider apiKey={GOOGLE_MAPS_KEY} language="ro" region="RO">
      <GoogleMapInner {...props} />
    </APIProvider>
  )
}
