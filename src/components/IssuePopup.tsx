import { CheckCircle2, Loader2, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, RESOLVE_THRESHOLD } from '../services/api'
import type { IssueAction, IssueFeedback, UserIssue } from '../types'
import { timeAgo } from '../utils/geo'
import { ISSUE_LABELS, SEVERITY_LABELS } from './markerMeta'

type Props = {
  issue: UserIssue
  onAction: (action: IssueAction, issue: UserIssue) => Promise<void>
}

export function IssuePopup({ issue, onAction }: Props) {
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<IssueFeedback | null>(null)

  // Backend-ul decide dacă utilizatorul curent e autorul și dacă a votat deja.
  useEffect(() => {
    let alive = true
    api
      .getFeedback(issue.id)
      .then((f) => alive && setFeedback(f))
      .catch(() => alive && setFeedback(null))
    return () => {
      alive = false
    }
  }, [issue.id, issue.resolveVotes])

  const mine = feedback ? feedback.canResolve : issue.mine
  const voted = feedback?.myVote != null
  const votes = issue.resolveVotes

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="popup">
      <div className="popup-tags">
        <span className={`popup-tag issue${mine ? ' mine' : ''}`}>{ISSUE_LABELS[issue.category]}</span>
        <span className={`popup-tag sev sev-${issue.severity}`}>Gravitate {SEVERITY_LABELS[issue.severity].toLowerCase()}</span>
      </div>
      <h4>{issue.title}</h4>
      <p>{issue.description}</p>
      <div className="popup-meta">
        {mine ? 'Raportat de tine' : 'Raportat de un utilizator'} · {timeAgo(issue.createdAt)} · rază {issue.radius} m
      </div>

      {!mine && (
        <div className="resolve-progress" aria-label={`${votes} din ${RESOLVE_THRESHOLD} confirmări`}>
          <div className="bar">
            <span style={{ width: `${(votes / RESOLVE_THRESHOLD) * 100}%` }} />
          </div>
          <small>
            {votes}/{RESOLVE_THRESHOLD} confirmări că s-a rezolvat
          </small>
        </div>
      )}

      {mine ? (
        <button className="btn btn-danger btn-sm full" disabled={busy} onClick={() => run(() => onAction('resolve', issue))}>
          {busy ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
          Problema s-a rezolvat – elimină
        </button>
      ) : (
        <button
          className="btn btn-primary btn-sm full"
          disabled={busy || voted || feedback?.canVote === false}
          onClick={() => run(() => onAction('vote', issue))}
        >
          {busy ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
          {feedback?.myVote === 'dispute'
            ? 'Ai confirmat rezolvarea'
            : feedback?.myVote === 'confirm'
              ? 'Ai confirmat că problema există'
              : 'Confirmă că s-a rezolvat'}
        </button>
      )}
    </div>
  )
}
