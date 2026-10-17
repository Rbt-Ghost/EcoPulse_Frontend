import { CheckCircle2, Loader2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { RESOLVE_THRESHOLD } from '../services/api'
import type { UserIssue } from '../types'
import { timeAgo } from '../utils/geo'
import { ISSUE_LABELS, SEVERITY_LABELS } from './markerMeta'

type Props = {
  issue: UserIssue
  userId: string
  onDelete: (issue: UserIssue) => Promise<void>
  onVote: (issue: UserIssue) => Promise<void>
}

export function IssuePopup({ issue, userId, onDelete, onVote }: Props) {
  const [busy, setBusy] = useState(false)
  const mine = issue.createdBy === userId
  const voted = issue.resolveVotes.includes(userId)
  const votes = issue.resolveVotes.length

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
        <button className="btn btn-danger btn-sm full" disabled={busy} onClick={() => run(() => onDelete(issue))}>
          {busy ? <Loader2 size={15} className="spin" /> : <Trash2 size={15} />}
          Problema s-a rezolvat – elimină
        </button>
      ) : (
        <button className="btn btn-primary btn-sm full" disabled={busy || voted} onClick={() => run(() => onVote(issue))}>
          {busy ? <Loader2 size={15} className="spin" /> : <CheckCircle2 size={15} />}
          {voted ? 'Ai confirmat rezolvarea' : 'Confirmă că s-a rezolvat'}
        </button>
      )}
    </div>
  )
}
