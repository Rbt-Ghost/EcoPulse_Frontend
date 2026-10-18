import {
  AlertTriangle,
  Cloud,
  Droplets,
  HardHat,
  Lightbulb,
  MessageSquareWarning,
  TrafficCone,
  TreeDeciduous,
  type LucideIcon,
} from 'lucide-react'
import type { IssueCategory, Severity, UserIssue } from '../types'

// Metadate pentru marcatori, independente de biblioteca de hartă.

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

export const STATUS_LABELS: Record<UserIssue['status'], string> = {
  pending: 'În așteptarea confirmărilor',
  confirmed: 'Confirmată de comunitate',
  resolved: 'Rezolvată',
  hidden: 'Ascunsă',
  expired: 'Expirată',
}

export const SEVERITY_LABELS: Record<Severity, string> = {
  low: 'Scăzută',
  medium: 'Medie',
  high: 'Ridicată',
}
