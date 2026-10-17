import { Leaf, Scale, Zap, type LucideIcon } from 'lucide-react'
import type { RouteMode } from '../types'

export const ROUTE_MODES: Record<
  RouteMode,
  { label: string; hint: string; color: string; icon: LucideIcon }
> = {
  cleanest: {
    label: 'Cel mai curat',
    hint: 'Expunere minimă la poluare',
    color: '#059669',
    icon: Leaf,
  },
  balanced: {
    label: 'Echilibrat',
    hint: 'Compromis timp / aer curat',
    color: '#0284c7',
    icon: Scale,
  },
  fastest: {
    label: 'Cel mai rapid',
    hint: 'Timp minim de deplasare',
    color: '#ea580c',
    icon: Zap,
  },
}

export const MODE_ORDER: RouteMode[] = ['cleanest', 'balanced', 'fastest']
