import { Check, ChevronUp, MapPin } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { IssueChat, type PlaceMode } from './components/IssueChat'
import { MapOverlay } from './components/MapOverlay'
import { GOOGLE_MAPS_KEY, type MapFocus } from './components/mapTypes'
import { NavRail, type Tab } from './components/NavRail'
import { RoutePlanner } from './components/RoutePlanner'
import { AirForecastCard, DeparturePicker } from './components/TripForecast'
import { useGeolocation } from './hooks/useGeolocation'
import { api, API_URL, ApiError, type ReportCategory, type ReportPlace } from './services/api'
import { reverseGeocode } from './services/geocoding'
import { computeRoutes, openInGoogleMaps } from './services/routing'
import type {
  AirForecast,
  ChatMessage,
  IssueAction,
  LatLng,
  LayerKey,
  LayerVisibility,
  MapData,
  RouteMode,
  RoutePlace,
  RouteResult,
  TrafficSnapshot,
  TravelProfile,
  UserIssue,
} from './types'

// Google Maps când există cheie API, altfel Leaflet + OpenStreetMap.
const MapView = lazy(() =>
  GOOGLE_MAPS_KEY ? import('./components/GoogleMapView') : import('./components/LeafletMapView'),
)

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: 'Salut! Sunt asistentul EcoPulse. Descrie-mi (în scris sau vocal) ce problemă ai observat – o groapă, fum, trafic, un șantier – și o adaug pe hartă, la locația ta sau într-un loc ales de tine. Mă poți întreba și cum e aerul ori traficul, acum sau mai târziu.',
  createdAt: new Date().toISOString(),
}

type Toast = { id: number; text: string; tone: 'ok' | 'error' }

export default function App() {
  const geo = useGeolocation()

  const [tab, setTab] = useState<Tab>('map')
  const [data, setData] = useState<MapData | null>(null)
  const [layers, setLayers] = useState<LayerVisibility>({
    pollution: true,
    traffic: true,
    hazards: true,
    construction: true,
    issues: true,
  })

  const [from, setFrom] = useState<RoutePlace | null>(null)
  const [to, setTo] = useState<RoutePlace | null>(null)
  const [profile, setProfile] = useState<TravelProfile>('foot')
  const [mode, setMode] = useState<RouteMode>('cleanest')
  const [routes, setRoutes] = useState<RouteResult | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)
  const routeAbort = useRef<AbortController | null>(null)
  /** `null` = plecare acum */
  const [departure, setDeparture] = useState<Date | null>(null)
  const [forecast, setForecast] = useState<{ key: string; value: AirForecast } | null>(null)
  const [traffic, setTraffic] = useState<TrafficSnapshot | null>(null)
  const trafficRef = useRef<TrafficSnapshot | null>(null)
  /** Ultima cerere de rute, refăcută când se schimbă traficul (altă oră de plecare) */
  const lastRoute = useRef<{ f: RoutePlace | null; t: RoutePlace | null; p: TravelProfile } | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME])
  const [sending, setSending] = useState(false)
  const [freshIssueId, setFreshIssueId] = useState<string | null>(null)
  /** Raportare trimisă fără GPS, care așteaptă locul ales pe hartă */
  const [awaitingPlace, setAwaitingPlace] = useState<{
    text: string
    messageId: string
    category: ReportCategory | null
  } | null>(null)
  const [reportCategory, setReportCategory] = useState<ReportCategory | null>(null)
  const [placeMode, setPlaceMode] = useState<PlaceMode>('gps')
  const [picking, setPicking] = useState(false)
  const [draftPin, setDraftPin] = useState<LatLng | null>(null)

  const [focus, setFocus] = useState<MapFocus | null>(null)
  const [sheetOpen, setSheetOpen] = useState(true)
  const [toast, setToast] = useState<Toast | null>(null)

  const notify = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    setToast({ id: Date.now(), text, tone })
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3800)
    return () => clearTimeout(t)
  }, [toast])

  // ------------------------------------------------------------ date hartă
  useEffect(() => {
    let alive = true
    api
      .getMapData()
      .then((d) => alive && setData(d))
      .catch(() => alive && notify(`Nu am putut contacta serverul EcoPulse (${API_URL}).`, 'error'))
    return () => {
      alive = false
    }
  }, [notify])

  const dataRef = useRef(data)
  useEffect(() => {
    dataRef.current = data
  }, [data])

  // ------------------------------------------------------------ rutare
  const requestRoutes = useCallback(
    async (f: RoutePlace | null, t: RoutePlace | null, p: TravelProfile) => {
      routeAbort.current?.abort()
      lastRoute.current = { f, t, p }
      setRouteError(null)
      if (!f || !t) {
        setRoutes(null)
        setRouteLoading(false)
        return
      }
      const snapshot = dataRef.current ?? { sensors: [], hazards: [], constructionZones: [], issues: [] }
      const ctrl = new AbortController()
      routeAbort.current = ctrl
      setRouteLoading(true)
      try {
        const result = await computeRoutes(f, t, p, snapshot, trafficRef.current?.segments ?? [], ctrl.signal)
        if (!ctrl.signal.aborted) setRoutes(result)
      } catch (e) {
        if (ctrl.signal.aborted) return
        setRoutes(null)
        setRouteError(e instanceof Error ? e.message : 'Nu s-a putut calcula traseul.')
      } finally {
        if (!ctrl.signal.aborted) setRouteLoading(false)
      }
    },
    [],
  )

  // ------------------------------------------------------------ trafic la ora plecării
  useEffect(() => {
    const ctrl = new AbortController()
    const load = () =>
      api
        .getTraffic(departure, ctrl.signal)
        .then((t) => {
          trafficRef.current = t
          setTraffic(t)
          // Rutele depind de trafic: le recalculăm pentru noua oră.
          const last = lastRoute.current
          if (last?.f && last.t) requestRoutes(last.f, last.t, last.p)
        })
        .catch(() => {
          /* fără date de trafic: rutele se calculează doar după poluare și obstacole */
        })
    load()
    // „Acum” se schimbă în timp: reîmprospătăm la 10 minute.
    const timer = departure ? undefined : setInterval(load, 600000)
    return () => {
      ctrl.abort()
      clearInterval(timer)
    }
  }, [departure, requestRoutes])

  // ------------------------------------------------------------ prognoză aer (CAMS / RNMCA)
  const selected = routes?.[mode] ?? null
  const forecastKey = selected ? `${selected.id}:${Math.round(selected.duration)}:${departure?.getTime() ?? 'now'}` : null
  useEffect(() => {
    if (!forecastKey || !selected) return
    const ctrl = new AbortController()
    const start = departure ?? new Date()
    api
      .getAirForecast(start, selected.duration, ctrl.signal)
      .then((value) => setForecast({ key: forecastKey, value }))
      .catch(() => {
        if (ctrl.signal.aborted) return
        const end = new Date(start.getTime() + selected.duration * 1000).toISOString()
        setForecast({
          key: forecastKey,
          value: {
            available: false,
            status: 'unavailable',
            window: { start: start.toISOString(), end },
            horizonEnd: end,
            index: null,
            dominant: null,
            pollutants: {},
            hourly: [],
            attribution: '',
            limitation: '',
          },
        })
      })
    return () => ctrl.abort()
  }, [forecastKey, selected, departure])
  const forecastLoading = forecastKey !== null && forecast?.key !== forecastKey

  const updateFrom = (p: RoutePlace | null) => {
    setFrom(p)
    requestRoutes(p, to, profile)
  }
  const updateTo = (p: RoutePlace | null) => {
    setTo(p)
    requestRoutes(from, p, profile)
  }
  const updateProfile = (p: TravelProfile) => {
    setProfile(p)
    requestRoutes(from, to, p)
  }
  const swap = () => {
    setFrom(to)
    setTo(from)
    requestRoutes(to, from, profile)
  }

  const useMyLocation = () => {
    if (geo.status !== 'gps') {
      geo.locate()
      notify('Nu avem acces la GPS – folosim centrul Iașului.', 'error')
    }
    updateFrom({ ...geo.position, label: geo.status === 'gps' ? 'Locația mea' : 'Centrul Iașului' })
  }

  const pickPoint = useCallback(
    async (which: 'from' | 'to', p: LatLng) => {
      const place = { ...p, label: 'Se identifică adresa…' }
      if (which === 'from') {
        setFrom(place)
        requestRoutes(place, to, profile)
      } else {
        setTo(place)
        requestRoutes(from, place, profile)
      }
      setSheetOpen(true)
      const label = await reverseGeocode(p)
      const set = which === 'from' ? setFrom : setTo
      set((cur) => (cur && cur.lat === p.lat && cur.lng === p.lng ? { ...cur, label } : cur))
    },
    [from, to, profile, requestRoutes],
  )

  // ------------------------------------------------------------ issues
  const removeIssue = (id: string) =>
    setData((d) => (d ? { ...d, issues: d.issues.filter((i) => i.id !== id) } : d))

  const resolveIssue = async (issue: UserIssue) => {
    try {
      await api.resolveIssue(issue.id)
      removeIssue(issue.id)
      notify('Problema a fost eliminată de pe hartă.')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Ștergerea a eșuat.', 'error')
    }
  }

  const voteResolved = async (issue: UserIssue) => {
    try {
      const updated = await api.voteResolved(issue.id)
      if (!updated) {
        removeIssue(issue.id)
        notify('Mulțumim! Problema a fost confirmată ca rezolvată și a dispărut de pe hartă.')
      } else {
        setData((d) => (d ? { ...d, issues: d.issues.map((i) => (i.id === updated.id ? updated : i)) } : d))
        notify('Mulțumim pentru confirmare!')
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Confirmarea a eșuat.', 'error')
    }
  }

  const issueAction = (action: IssueAction, issue: UserIssue) =>
    action === 'resolve' ? resolveIssue(issue) : voteResolved(issue)

  const showIssue = (issue: UserIssue) => {
    setTab('map')
    setLayers((l) => ({ ...l, issues: true }))
    setFocus({ lat: issue.lat, lng: issue.lng, zoom: 15, key: Date.now() })
    if (window.innerWidth < 860) setSheetOpen(false)
  }

  // ------------------------------------------------------------ raportare
  const patchMessage = (id: string, patch: Partial<ChatMessage>) =>
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, ...patch } : x)))

  /** Publică raportarea la locul dat; răspunsul înlocuiește mesajul „pending” cu id-ul dat. */
  const publish = async (text: string, place: ReportPlace, pendingId: string, category: ReportCategory | null) => {
    setSending(true)
    try {
      const { reply, issue } = await api.reportFromText(text, place, category)
      patchMessage(pendingId, { text: reply, issue, pending: false })
      setData((d) => (d ? { ...d, issues: [...d.issues.filter((i) => i.id !== issue.id), issue] } : d))
      setFreshIssueId(issue.id)
      setLayers((l) => ({ ...l, issues: true }))
      if (window.innerWidth >= 860) setFocus({ lat: issue.lat, lng: issue.lng, zoom: 15, key: Date.now() })
    } catch (e) {
      const detail = e instanceof ApiError && e.status === 422 ? ` ${e.message}` : ''
      patchMessage(pendingId, {
        pending: false,
        text: `Nu am putut adăuga problema pe hartă.${detail} Încearcă din nou în câteva momente.`,
      })
    } finally {
      setSending(false)
    }
  }

  const sendMessage = async (text: string) => {
    const pendingId = crypto.randomUUID()
    setAwaitingPlace(null)
    setDraftPin(null)
    setMessages((m) => [
      // O raportare anterioară care aștepta locul pe hartă e înlocuită de cea nouă.
      ...m.map((x) => (x.pickLocation ? { ...x, pickLocation: false } : x)),
      { id: crypto.randomUUID(), role: 'user', text, createdAt: new Date().toISOString() },
      { id: pendingId, role: 'assistant', text: '', createdAt: new Date().toISOString(), pending: true },
    ])
    const category = reportCategory
    setSending(true)
    // Fără tip ales, mesajul poate fi o întrebare despre aer / trafic: răspunde asistentul.
    if (!category) {
      try {
        const answer = await api.ask(text, geo.status === 'gps' ? geo.position : null)
        if (answer.kind === 'answer') {
          patchMessage(pendingId, { pending: false, text: answer.reply })
          setSending(false)
          return
        }
      } catch {
        /* asistent indisponibil: tratăm mesajul ca raportare */
      }
    }
    // Locul a fost marcat pe hartă înainte de trimitere: publicăm direct acolo.
    if (placeMode === 'map' && draftPin) {
      const place = draftPin
      setDraftPin(null)
      setPicking(false)
      setSending(false)
      await publish(text, place, pendingId, category)
      return
    }
    const fix = placeMode === 'gps' ? await geo.freshFix() : null
    setSending(false)
    if (fix) {
      await publish(text, fix, pendingId, category)
      return
    }
    // Loc ales manual (sau fără GPS): utilizatorul apasă pe hartă locul problemei.
    patchMessage(pendingId, {
      pending: false,
      pickLocation: true,
      text:
        placeMode === 'map'
          ? 'Apasă pe hartă locul exact al problemei și confirmă cu „Adaugă aici”.'
          : 'Nu am acces la locația ta. Apasă pe hartă locul unde se află problema și confirmă, iar eu o adaug imediat.',
    })
    setAwaitingPlace({ text, messageId: pendingId, category })
    setPicking(true)
    if (window.innerWidth < 860) setSheetOpen(false)
  }

  const confirmPlace = async () => {
    if (!awaitingPlace || !draftPin) return
    const { text, messageId, category } = awaitingPlace
    const place = draftPin
    const pendingId = crypto.randomUUID()
    patchMessage(messageId, { pickLocation: false })
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), role: 'user', text: 'Locul ales pe hartă', createdAt: new Date().toISOString() },
      { id: pendingId, role: 'assistant', text: '', createdAt: new Date().toISOString(), pending: true },
    ])
    setAwaitingPlace(null)
    setPicking(false)
    setDraftPin(null)
    await publish(text, place, pendingId, category)
  }

  const cancelPicking = () => {
    setPicking(false)
    setDraftPin(null)
    if (awaitingPlace) {
      patchMessage(awaitingPlace.messageId, { pickLocation: false })
      setAwaitingPlace(null)
    }
  }

  /** „Aleg pe hartă” deschide imediat harta (pe mobil) și acceptă clicul pentru loc. */
  const changePlaceMode = (m: PlaceMode) => {
    setPlaceMode(m)
    if (m === 'map') setPicking(true)
    else if (!awaitingPlace) {
      setPicking(false)
      setDraftPin(null)
    }
  }

  const toggleLayer = (key: LayerKey) => setLayers((l) => ({ ...l, [key]: !l[key] }))

  const exportRoute = () => {
    if (routes) openInGoogleMaps(routes[mode], profile)
  }

  const placing = picking && tab === 'report'
  /** Clicul pe hartă alege locul raportării: după „Aleg pe hartă” sau când o raportare așteaptă locul. */
  const choosingPlace = tab === 'report' && (picking || placeMode === 'map')

  return (
    <div className={`app tab-${tab}${sheetOpen ? ' sheet-open' : ''}${placing ? ' placing' : ''}`}>
      <NavRail tab={tab} onChange={setTab} issueCount={data?.issues.length ?? 0} />

      <aside className="panel" aria-label={tab === 'map' ? 'Planificare traseu' : 'Raportare probleme'}>
        {tab === 'map' && (
          <button className="sheet-handle" onClick={() => setSheetOpen((o) => !o)} aria-expanded={sheetOpen} aria-label="Extinde panoul">
            <span />
            <ChevronUp size={16} />
          </button>
        )}
        {tab === 'map' ? (
          <RoutePlanner
            data={data}
            from={from}
            to={to}
            onFromChange={updateFrom}
            onToChange={updateTo}
            onSwap={swap}
            onUseMyLocation={useMyLocation}
            profile={profile}
            onProfileChange={updateProfile}
            mode={mode}
            onModeChange={setMode}
            routes={routes}
            traffic={traffic}
            later={!!departure}
            loading={routeLoading}
            error={routeError}
            onRetry={() => requestRoutes(from, to, profile)}
            onExport={exportRoute}
            options={<DeparturePicker value={departure} onChange={setDeparture} />}
            details={
              <AirForecastCard
                forecast={forecast?.key === forecastKey ? forecast.value : null}
                loading={forecastLoading}
                future={!!departure}
              />
            }
          />
        ) : (
          <IssueChat
            messages={messages}
            sending={sending}
            geoStatus={geo.status}
            accuracy={geo.accuracy}
            onRelocate={geo.locate}
            onSend={sendMessage}
            onPickOnMap={() => setPicking(true)}
            onShowIssue={showIssue}
            category={reportCategory}
            onCategoryChange={setReportCategory}
            placeMode={placeMode}
            onPlaceModeChange={changePlaceMode}
            placeMarked={!!draftPin}
          />
        )}
      </aside>

      <main className="map-wrap">
        <Suspense fallback={<div className="map" />}>
          <MapView
            data={data}
            traffic={traffic}
            layers={layers}
            userPosition={geo.position}
            hasGps={geo.status === 'gps'}
            from={from}
            to={to}
            routes={routes}
            mode={mode}
            onModeChange={setMode}
            onPickPoint={tab === 'map' ? pickPoint : null}
            onPlacePick={choosingPlace ? setDraftPin : null}
            draftPin={choosingPlace ? draftPin : null}
            focus={focus}
            freshIssueId={freshIssueId}
            onIssueAction={issueAction}
          />
        </Suspense>
        <MapOverlay layers={layers} onToggle={toggleLayer} loading={!data} />
        {choosingPlace && (
          <div className="place-banner" role="dialog" aria-label="Alege locul problemei">
            <MapPin size={18} />
            <span>
              {!draftPin
                ? 'Apasă pe hartă locul unde se află problema.'
                : awaitingPlace
                  ? 'Locul a fost marcat. Îl poți muta apăsând din nou pe hartă.'
                  : 'Locul a fost marcat (îl poți muta). Acum scrie sau alege tipul problemei în chat și trimite.'}
            </span>
            <div className="place-banner-actions">
              <button
                className="btn btn-sm btn-soft"
                onClick={() => {
                  cancelPicking()
                  changePlaceMode('gps')
                }}
              >
                Anulează
              </button>
              {awaitingPlace ? (
                <button className="btn btn-sm btn-primary" disabled={!draftPin || sending} onClick={confirmPlace}>
                  <Check size={15} /> Adaugă aici
                </button>
              ) : (
                picking && (
                  // Pe mobil harta acoperă chat-ul: revenim la el ca să scriem raportarea.
                  <button className="btn btn-sm btn-primary" disabled={!draftPin} onClick={() => setPicking(false)}>
                    <Check size={15} /> Continuă în chat
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </main>

      {toast && (
        <div key={toast.id} className={`toast ${toast.tone}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  )
}
