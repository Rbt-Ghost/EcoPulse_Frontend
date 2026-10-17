import {
  AlertTriangle,
  CircleDot,
  Cloud,
  Droplets,
  HardHat,
  Lightbulb,
  MessageSquareWarning,
  TrafficCone,
  TreeDeciduous,
  type LucideIcon,
} from 'lucide-react'
import type { HazardKind, IssueCategory, Severity } from '../types'

// Metadate pentru marcatori, independente de biblioteca de hartă.

export const HAZARD_ICONS: Record<HazardKind, LucideIcon> = {
  pothole: CircleDot,
  sidewalk: AlertTriangle,
  flooding: Droplets,
  manhole: CircleDot,
  traffic_light: TrafficCone,
  lighting: Lightbulb,
}

export const ISSUE_ICONS: Record<IssueCategory, LucideIcon> = {
  infrastructure: AlertTriangle,
  pollution: Cloud,
  construction: HardHat,
  traffic: TrafficCone,
  flooding: Droplets,
  obstruction: TreeDeciduous,
  lighting: Lightbulb,
  other: MessageSquareWarning,
}

export const ISSUE_LABELS: Record<IssueCategory, string> = {
  infrastructure: 'Infrastructură',
  pollution: 'Poluare',
  construction: 'Construcții',
  traffic: 'Trafic',
  flooding: 'Inundație',
  obstruction: 'Obstacol',
  lighting: 'Iluminat',
  other: 'Altele',
}

export const SEVERITY_LABELS: Record<Severity, string> = {
  low: 'Scăzută',
  medium: 'Medie',
  high: 'Ridicată',
}
