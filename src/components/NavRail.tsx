import { Map as MapIcon, MessageSquareText } from 'lucide-react'

export type Tab = 'map' | 'report'

const TABS: { id: Tab; label: string; icon: typeof MapIcon }[] = [
  { id: 'map', label: 'Hartă', icon: MapIcon },
  { id: 'report', label: 'Raportează', icon: MessageSquareText },
]

export function Logo() {
  return (
    <svg viewBox="0 0 64 64" width="36" height="36" aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#0d9488" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#lg)" />
      <path d="M18 44c0-15 10-25 30-26-1 19-11 28-26 28" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 46l14-14" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

type Props = {
  tab: Tab
  onChange: (t: Tab) => void
  issueCount: number
}

export function NavRail({ tab, onChange, issueCount }: Props) {
  return (
    <nav className="nav-rail" aria-label="Navigare principală">
      <div className="brand">
        <Logo />
        <span className="brand-name">EcoPulse</span>
      </div>
      <div className="nav-tabs" role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`nav-tab${tab === id ? ' active' : ''}`}
            onClick={() => onChange(id)}
          >
            <span className="nav-icon">
              <Icon size={21} />
              {id === 'map' && issueCount > 0 && <span className="nav-badge">{issueCount}</span>}
            </span>
            <span className="nav-label">{label}</span>
          </button>
        ))}
      </div>
      <div className="nav-foot">Iași</div>
    </nav>
  )
}
