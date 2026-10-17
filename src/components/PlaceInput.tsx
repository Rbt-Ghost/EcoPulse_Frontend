import { Loader2, LocateFixed, MapPin, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { searchPlaces } from '../services/geocoding'
import type { RoutePlace } from '../types'

type Props = {
  kind: 'from' | 'to'
  value: RoutePlace | null
  placeholder: string
  onChange: (p: RoutePlace | null) => void
  onUseMyLocation?: () => void
}

export function PlaceInput({ kind, value, placeholder, onChange, onUseMyLocation }: Props) {
  const [query, setQuery] = useState(value?.label ?? '')
  const [results, setResults] = useState<RoutePlace[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [lastValue, setLastValue] = useState(value)
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)

  // Sincronizăm textul când valoarea e setată din exterior (click pe hartă, swap etc.).
  if (value !== lastValue) {
    setLastValue(value)
    setQuery(value?.label ?? '')
  }

  useEffect(() => {
    const q = query.trim()
    if (!open || q.length < 3 || q === value?.label) return
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        setResults(await searchPlaces(q, ctrl.signal))
        setActive(0)
      } catch {
        if (!ctrl.signal.aborted) setResults([])
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    }, 380)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [query, open, value?.label])

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  const choose = (p: RoutePlace) => {
    onChange(p)
    setOpen(false)
    setResults([])
  }

  const showList = open && query.trim().length >= 3 && query !== value?.label

  return (
    <div className="place-input" ref={wrapRef}>
      <span className={`place-dot ${kind}`} aria-hidden>
        {kind === 'from' ? 'A' : 'B'}
      </span>
      <input
        value={query}
        placeholder={placeholder}
        aria-label={kind === 'from' ? 'Punct de plecare' : 'Destinație'}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!showList || !results.length) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => (a + 1) % results.length)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => (a - 1 + results.length) % results.length)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            choose(results[active])
          } else if (e.key === 'Escape') setOpen(false)
        }}
      />
      {loading && <Loader2 size={16} className="spin muted" />}
      {!loading && query && (
        <button
          className="icon-btn ghost"
          aria-label="Șterge"
          onClick={() => {
            setQuery('')
            onChange(null)
          }}
        >
          <X size={15} />
        </button>
      )}
      {!query && onUseMyLocation && (
        <button className="icon-btn ghost accent" title="Folosește locația mea" aria-label="Folosește locația mea" onClick={onUseMyLocation}>
          <LocateFixed size={16} />
        </button>
      )}

      {showList && (
        <ul className="place-results" id={listId} role="listbox">
          {results.length === 0 && !loading && <li className="empty">Niciun rezultat în Iași</li>}
          {results.map((r, i) => (
            <li
              key={`${r.lat},${r.lng},${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onPointerDown={(e) => {
                e.preventDefault()
                choose(r)
              }}
              onMouseEnter={() => setActive(i)}
            >
              <MapPin size={15} />
              <span>{r.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
