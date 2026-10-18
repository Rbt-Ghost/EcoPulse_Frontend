import L from 'leaflet'
import { Construction, type LucideIcon } from 'lucide-react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { IssueCategory } from '../types'
import { aqiBand } from '../utils/geo'
import { ISSUE_ICONS } from './markerMeta'

const svg = (Icon: LucideIcon, size = 16) =>
  renderToStaticMarkup(createElement(Icon, { size, strokeWidth: 2.4, color: 'currentColor' }))

const cache = new Map<string, L.DivIcon>()
function cached(key: string, make: () => L.DivIcon) {
  let icon = cache.get(key)
  if (!icon) {
    icon = make()
    cache.set(key, icon)
  }
  return icon
}

export function sensorIcon(aqi: number) {
  const band = aqiBand(aqi)
  return cached(`s-${aqi}`, () =>
    L.divIcon({
      className: 'ep-marker',
      html: `<div class="mk-sensor" style="--c:${band.color}"><span>${aqi}</span></div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -16],
    }),
  )
}

export function constructionIcon() {
  return cached('c', () =>
    L.divIcon({
      className: 'ep-marker',
      html: `<div class="mk-construction">${svg(Construction, 16)}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -14],
    }),
  )
}

export function issueIcon(category: IssueCategory, mine: boolean, fresh = false) {
  return cached(`i-${category}-${mine}-${fresh}`, () =>
    L.divIcon({
      className: 'ep-marker',
      html: `<div class="mk-issue${mine ? ' mine' : ''}${fresh ? ' fresh' : ''}"><div class="pin">${svg(ISSUE_ICONS[category], 16)}</div></div>`,
      iconSize: [36, 44],
      iconAnchor: [18, 42],
      popupAnchor: [0, -38],
    }),
  )
}

export function endpointIcon(kind: 'start' | 'end') {
  return cached(`e-${kind}`, () =>
    L.divIcon({
      className: 'ep-marker',
      html: `<div class="mk-endpoint ${kind}">${kind === 'start' ? 'A' : 'B'}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    }),
  )
}

export function userIcon() {
  return cached('u', () =>
    L.divIcon({
      className: 'ep-marker',
      html: '<div class="mk-user"><span></span></div>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    }),
  )
}
