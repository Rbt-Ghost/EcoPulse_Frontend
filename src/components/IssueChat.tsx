import {
  Bot,
  LocateFixed,
  Map as MapIcon,
  Mic,
  MicOff,
  SendHorizontal,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { GeoStatus } from '../hooks/useGeolocation'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import type { ChatMessage, UserIssue } from '../types'
import { ISSUE_ICONS, ISSUE_LABELS, SEVERITY_LABELS } from './markerMeta'

type Props = {
  messages: ChatMessage[]
  sending: boolean
  geoStatus: GeoStatus
  accuracy: number | null
  onRelocate: () => void
  onSend: (text: string) => void
  onShowIssue: (issue: UserIssue) => void
}

const SUGGESTIONS = [
  'Groapă mare pe carosabil, periculoasă pentru bicicliști',
  'Miroase puternic a fum și plastic ars',
  'Trotuarul e inundat după ploaie',
  'Un copac căzut blochează trotuarul',
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
    const v = value.trim()
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
    props.geoStatus === 'gps'
      ? `Locație GPS${props.accuracy ? ` · ±${Math.round(props.accuracy)} m` : ''}`
      : props.geoStatus === 'pending'
        ? 'Se determină locația…'
        : 'Locație aproximativă (centrul Iașului)'

  const onlyWelcome = props.messages.length <= 1

  return (
    <div className="chat">
      <header className="panel-header chat-header">
        <div>
          <h1>Raportează o problemă</h1>
          <p>Descrie ce ai observat. Asistentul AI o va plasa pe hartă, în jurul locației tale.</p>
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
            </div>
          </div>
        ))}

        {onlyWelcome && (
          <div className="suggestions">
            <span>
              <Sparkles size={14} /> Încearcă:
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
          placeholder={speech.listening ? 'Te ascult… vorbește acum' : 'Ex: groapă mare pe Bd. Independenței…'}
          aria-label="Descrierea problemei"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <button type="submit" className="icon-btn send" disabled={!text.trim() || props.sending} aria-label="Trimite">
          <SendHorizontal size={18} />
        </button>
      </form>
    </div>
  )
}
