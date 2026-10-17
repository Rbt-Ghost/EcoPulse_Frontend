import { ChevronUp } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IssueChat } from './components/IssueChat'
import { MapOverlay } from './components/MapOverlay'
import { GOOGLE_MAPS_KEY, type MapFocus } from './components/mapTypes'
import { NavRail, type Tab } from './components/NavRail'
import { RoutePlanner } from './components/RoutePlanner'
import { useGeolocation } from './hooks/useGeolocation'
import { api, getUserId, USING_MOCK } from './services/api'
import { reverseGeocode } from './services/geocoding'
import { computeRoutes, openInGoogleMaps } from './services/routing'
import type {
  ChatMessage,
  LatLng,
  LayerKey,
  LayerVisibility,
  MapData,
  RouteMode,
  RoutePlace,
  RouteResult,
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
  text: 'Salut! Sunt asistentul EcoPulse. Spune-mi (în scris sau vocal) ce problemă ai observat în jurul tău – o groapă, o zonă inundată, fum, un șantier nesemnalizat – și o adaug pe hartă pentru ceilalți locuitori.',
  createdAt: new Date().toISOString(),
}

type Toast = { id: number; text: string; tone: 'ok' | 'error' }

export default function App() {
  const userId = useMemo(() => getUserId(), [])
  const geo = useGeolocation()

  const [tab, setTab] = useState<Tab>('map')
  const [data, setData] = useState<MapData | null>(null)
  const [layers, setLayers] = useState<LayerVisibility>({
    pollution: true,
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

  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME])
  const [sending, setSending] = useState(false)
  const [freshIssueId, setFreshIssueId] = useState<string | null>(null)

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
      .catch(() => alive && notify('Nu am putut încărca datele hărții.', 'error'))
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
        const result = await computeRoutes(f, t, p, snapshot, ctrl.signal)
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

  const deleteIssue = async (issue: UserIssue) => {
    try {
      await api.deleteIssue(issue.id, userId)
      removeIssue(issue.id)
      notify('Problema a fost eliminată de pe hartă.')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Ștergerea a eșuat.', 'error')
    }
  }

  const voteResolve = async (issue: UserIssue) => {
    try {
      const updated = await api.voteResolve(issue.id, userId)
      if (!updated) {
        removeIssue(issue.id)
        notify('Mulțumim! Problema a fost confirmată ca rezolvată și a dispărut de pe hartă.')
      } else {
        setData((d) => (d ? { ...d, issues: d.issues.map((i) => (i.id === updated.id ? updated : i)) } : d))
        notify('Mulțumim pentru confirmare!')
      }
    } catch {
      notify('Confirmarea a eșuat.', 'error')
    }
  }

  const showIssue = (issue: UserIssue) => {
    setTab('map')
    setLayers((l) => ({ ...l, issues: true }))
    setFocus({ lat: issue.lat, lng: issue.lng, zoom: 15, key: Date.now() })
    if (window.innerWidth < 860) setSheetOpen(false)
  }

  const sendMessage = async (text: string) => {
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', text, createdAt: new Date().toISOString() }
    const pendingId = crypto.randomUUID()
    const history = [...messages, userMsg].filter((m) => !m.pending).map(({ role, text }) => ({ role, text }))
    setMessages((m) => [
      ...m,
      userMsg,
      { id: pendingId, role: 'assistant', text: '', createdAt: new Date().toISOString(), pending: true },
    ])
    setSending(true)
    try {
      const res = await api.reportViaChat({ message: text, history, location: geo.position, userId })
      setMessages((m) =>
        m.map((x) => (x.id === pendingId ? { ...x, text: res.reply, issue: res.issue, pending: false } : x)),
      )
      if (res.issue) {
        const issue = res.issue
        setData((d) => (d ? { ...d, issues: [...d.issues, issue] } : d))
        setFreshIssueId(issue.id)
        setLayers((l) => ({ ...l, issues: true }))
        if (window.innerWidth >= 860) setFocus({ lat: issue.lat, lng: issue.lng, zoom: 15, key: Date.now() })
      }
    } catch {
      setMessages((m) =>
        m.map((x) =>
          x.id === pendingId
            ? { ...x, pending: false, text: 'Îmi pare rău, nu am putut procesa mesajul acum. Încearcă din nou în câteva momente.' }
            : x,
        ),
      )
    } finally {
      setSending(false)
    }
  }

  const toggleLayer = (key: LayerKey) => setLayers((l) => ({ ...l, [key]: !l[key] }))

  const exportRoute = () => {
    if (routes) openInGoogleMaps(routes[mode], profile)
  }

  return (
    <div className={`app tab-${tab}${sheetOpen ? ' sheet-open' : ''}`}>
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
            loading={routeLoading}
            error={routeError}
            onRetry={() => requestRoutes(from, to, profile)}
            onExport={exportRoute}
          />
        ) : (
          <IssueChat
            messages={messages}
            sending={sending}
            geoStatus={geo.status}
            accuracy={geo.accuracy}
            onRelocate={geo.locate}
            onSend={sendMessage}
            onShowIssue={showIssue}
          />
        )}
        {USING_MOCK && (
          <div className="demo-note">Mod demo · date simulate local până la conectarea backend-ului</div>
        )}
      </aside>

      <main className="map-wrap">
        <Suspense fallback={<div className="map" />}>
          <MapView
            data={data}
            layers={layers}
            userId={userId}
            userPosition={geo.position}
            hasGps={geo.status === 'gps'}
            from={from}
            to={to}
            routes={routes}
            mode={mode}
            onModeChange={setMode}
            onPickPoint={tab === 'map' ? pickPoint : null}
            focus={focus}
            freshIssueId={freshIssueId}
            onDeleteIssue={deleteIssue}
            onVoteResolve={voteResolve}
          />
        </Suspense>
        <MapOverlay layers={layers} onToggle={toggleLayer} loading={!data} />
      </main>

      {toast && (
        <div key={toast.id} className={`toast ${toast.tone}`} role="status">
          {toast.text}
        </div>
      )}
    </div>
  )
}
