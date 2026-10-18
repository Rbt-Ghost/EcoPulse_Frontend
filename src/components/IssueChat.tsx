import { Bot, LocateFixed, Map as MapIcon, MapPin, Mic, MicOff, SendHorizontal, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { GeoStatus } from '../hooks/useGeolocation'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import type { ReportCategory } from '../services/api'
import type { ChatMessage, UserIssue } from '../types'
import { ISSUE_ICONS, ISSUE_LABELS, SEVERITY_LABELS } from './markerMeta'

type Props = {
  messages: ChatMessage[]
  sending: boolean
  geoStatus: GeoStatus
  accuracy: number | null
  onRelocate: () => void
  onSend: (text: string) => void
  /** Reia alegerea locului pe hartă pentru raportarea fără GPS */
  onPickOnMap: () => void
  onShowIssue: (issue: UserIssue) => void
  /** Tipul ales manual; `null` = îl deduce asistentul din text */
  category: ReportCategory | null
  onCategoryChange: (c: ReportCategory | null) => void
  /** Unde se pune raportarea: la locația GPS sau într-un loc ales pe hartă */
  placeMode: PlaceMode
  onPlaceModeChange: (m: PlaceMode) => void
  /** Locul raportării e deja marcat pe hartă */
  placeMarked: boolean
}

export type PlaceMode = 'gps' | 'map'

/** Tipurile pe care le poate alege utilizatorul; textul implicit e folosit când nu scrie nimic. */
const REPORT_TYPES: { id: ReportCategory; label: string; text: string }[] = [
  { id: 'smoke', label: 'Fum', text: 'Fum în zonă.' },
  { id: 'dust', label: 'Praf', text: 'Praf în suspensie în zonă.' },
  { id: 'industrial', label: 'Miros / industrial', text: 'Miros puternic sau poluare industrială în zonă.' },
  { id: 'traffic', label: 'Trafic', text: 'Trafic foarte aglomerat în zonă.' },
  { id: 'infrastructure', label: 'Groapă / trotuar', text: 'Problemă de infrastructură pe drum sau trotuar.' },
  { id: 'flooding', label: 'Inundație', text: 'Zonă inundată.' },
  { id: 'other', label: 'Altceva', text: 'Problemă semnalată în zonă.' },
]

const QUESTIONS = ['Cum e aerul acum?', 'Pot să alerg mâine la 7 dimineața?', 'Cum e traficul diseară?']

const SUGGESTIONS = [
  'groapa mare pe carosabil, periculoasa pt biciclisti',
  'miroase puternic a fum si plastic ars',
  'trotuarul e inundat dupa ploaie nu se poate trece',
  'un copac cazut blocheaza trotuarul',
]

function IssueCard({ issue, onShow }: { issue: UserIssue; onShow: () => void }) {
  const Icon = ISSUE_ICONS[issue.category]
  return (
    <div className="chat-issue">
      <div className="chat-issue-head">
        <span className="chat-issue-icon">
          <Icon size={18} />
        </span>
        <div>
          <strong>{issue.title}</strong>
          <small>
            {ISSUE_LABELS[issue.category]} · gravitate {SEVERITY_LABELS[issue.severity].toLowerCase()} · rază {issue.radius} m
          </small>
        </div>
      </div>
      <button className="btn btn-sm btn-soft full" onClick={onShow}>
        <MapIcon size={15} /> Vezi pe hartă
      </button>
    </div>
  )
}

export function IssueChat(props: Props) {
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const baseRef = useRef('')

  const onSpeech = useCallback((spoken: string) => {
    setText(baseRef.current ? `${baseRef.current} ${spoken}` : spoken)
  }, [])
  const speech = useSpeechRecognition(onSpeech)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [props.messages])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [text])

  const send = (value = text) => {
    // Cu un tip ales, raportarea se poate trimite și fără descriere.
    const v = value.trim() || REPORT_TYPES.find((t) => t.id === props.category)?.text || ''
    if (!v || props.sending) return
    if (speech.listening) speech.stop()
    props.onSend(v)
    setText('')
  }

  const toggleMic = () => {
    if (speech.listening) speech.stop()
    else {
      baseRef.current = text.trim()
      speech.start()
    }
  }

  const geoLabel =
    props.placeMode === 'map'
      ? props.placeMarked
        ? 'Loc marcat pe hartă ✓'
        : 'Apasă pe hartă locul problemei'
      : props.geoStatus === 'gps'
      ? `Locație GPS${props.accuracy ? ` · ±${Math.round(props.accuracy)} m` : ''}`
      : props.geoStatus === 'pending'
        ? 'Se determină locația…'
        : 'Fără GPS · vei alege locul pe hartă'

  const onlyWelcome = props.messages.length <= 1

  return (
    <div className="chat">
      <header className="panel-header chat-header">
        <div>
          <h1>Raportează sau întreabă</h1>
          <p>
            Descrie ce ai observat și o adăugăm pe hartă (rază 500 m), sau întreabă-mă cum e aerul ori traficul –
            acum sau la o oră anume.
          </p>
        </div>
        <button
          className={`geo-pill ${props.geoStatus}`}
          onClick={props.onRelocate}
          title="Actualizează locația"
        >
          <LocateFixed size={14} />
          {geoLabel}
        </button>
      </header>

      <div className="chat-list" ref={listRef} aria-live="polite">
        {props.messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.role === 'assistant' && (
              <span className="avatar" aria-hidden>
                <Bot size={16} />
              </span>
            )}
            <div className="bubble">
              {m.pending ? (
                <span className="typing" aria-label="Asistentul scrie">
                  <i />
                  <i />
                  <i />
                </span>
              ) : (
                <p>{m.text}</p>
              )}
              {m.issue && <IssueCard issue={m.issue} onShow={() => props.onShowIssue(m.issue!)} />}
              {m.pickLocation && (
                <button className="btn btn-sm btn-soft full" onClick={props.onPickOnMap}>
                  <MapPin size={15} /> Alege locul pe hartă
                </button>
              )}
            </div>
          </div>
        ))}

        {onlyWelcome && (
          <div className="suggestions">
            <span>
              <Sparkles size={14} /> Întreabă:
            </span>
            {QUESTIONS.map((s) => (
              <button key={s} className="chip" onClick={() => send(s)}>
                {s}
              </button>
            ))}
            <span>
              <Sparkles size={14} /> Sau raportează:
            </span>
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {speech.error && <div className="chat-error">{speech.error}</div>}

      <div className="report-options">
        <div className="chip-row" role="radiogroup" aria-label="Tipul problemei">
          <button
            role="radio"
            aria-checked={!props.category}
            className={`chip${!props.category ? ' on' : ''}`}
            onClick={() => props.onCategoryChange(null)}
          >
            Automat
          </button>
          {REPORT_TYPES.map((t) => (
            <button
              key={t.id}
              role="radio"
              aria-checked={props.category === t.id}
              className={`chip${props.category === t.id ? ' on' : ''}`}
              onClick={() => props.onCategoryChange(props.category === t.id ? null : t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="segmented two" role="radiogroup" aria-label="Unde este problema">
          <button
            role="radio"
            aria-checked={props.placeMode === 'gps'}
            className={props.placeMode === 'gps' ? 'active' : ''}
            onClick={() => props.onPlaceModeChange('gps')}
          >
            <LocateFixed size={15} /> Locația mea
          </button>
          <button
            role="radio"
            aria-checked={props.placeMode === 'map'}
            className={props.placeMode === 'map' ? 'active' : ''}
            // Apăsat din nou (ex. după „Continuă în chat”), redeschide harta pentru a muta locul.
            onClick={() => props.onPlaceModeChange('map')}
          >
            <MapPin size={15} /> Aleg pe hartă
          </button>
        </div>
      </div>

      <form
        className={`composer${speech.listening ? ' listening' : ''}`}
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        {speech.supported && (
          <button
            type="button"
            className={`icon-btn mic${speech.listening ? ' on' : ''}`}
            onClick={toggleMic}
            aria-label={speech.listening ? 'Oprește dictarea' : 'Dictează mesajul'}
            title={speech.listening ? 'Oprește dictarea' : 'Dictează (speech-to-text)'}
          >
            {speech.listening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
        )}
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          placeholder={
            speech.listening
              ? 'Te ascult… vorbește acum'
              : props.category
                ? 'Detalii (opțional)…'
                : 'Descrie problema sau întreabă „Cum e aerul mâine?”'
          }
          aria-label="Mesaj: descrierea problemei sau o întrebare"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <button
          type="submit"
          className="icon-btn send"
          disabled={(!text.trim() && !props.category) || props.sending}
          aria-label="Trimite"
        >
          <SendHorizontal size={18} />
        </button>
      </form>
    </div>
  )
}
