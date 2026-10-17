import type { IssueCategory, Severity, UserIssue } from '../types'
import type { ChatReply, ChatRequest } from './api'

// Simulează răspunsul LLM-ului (ex. Gemini) până la implementarea backend-ului.
// Backend-ul real va primi același ChatRequest și va întoarce același ChatReply.

// Ordinea contează: categoriile specifice înaintea celor generice (infrastructura e ultima).
// Cuvintele sunt rădăcini: se potrivesc la început de cuvânt („gro” → „groapă”, dar „apă” ≠ „groapă”).
const CATEGORY_RULES: { category: IssueCategory; words: string[]; title: string }[] = [
  { category: 'flooding', words: ['inund', 'balt', 'băltește', 'apă', 'apa', 'canal înfundat', 'canalizare'], title: 'Zonă inundată' },
  { category: 'pollution', words: ['fum', 'miros', 'miroase', 'polu', 'praf', 'ars', 'arde', 'gunoi', 'smog', 'noxe'], title: 'Poluare semnalată' },
  { category: 'obstruction', words: ['copac', 'creang', 'obstacol', 'bloche', 'cablu'], title: 'Obstacol pe drum' },
  { category: 'traffic', words: ['accident', 'trafic', 'ambuteiaj', 'coloan', 'coliziune', 'tamponare'], title: 'Trafic blocat' },
  { category: 'lighting', words: ['ilumin', 'întuneric', 'intuneric', 'bec', 'stâlp', 'stalp', 'lumin'], title: 'Iluminat defect' },
  { category: 'construction', words: ['șantier', 'santier', 'lucrăr', 'lucrar', 'construc', 'excava', 'macara'], title: 'Lucrări neanunțate' },
  { category: 'infrastructure', words: ['groap', 'gropi', 'trotuar', 'asfalt', 'capac', 'semafor', 'bordur', 'pavaj', 'fisur', 'denivel'], title: 'Problemă de infrastructură' },
]

const HIGH_WORDS = ['pericul', 'grav', 'urgent', 'foarte', 'imens', 'uriaș', 'accident', 'rănit', 'adânc']
const LOW_WORDS = ['mic', 'ușor', 'usor', 'puțin', 'putin', 'minor']

const hasStem = (text: string, stem: string) =>
  new RegExp(String.raw`(^|[^\p{L}])${stem}`, 'iu').test(text)

const CATEGORY_LABEL: Record<IssueCategory, string> = {
  infrastructure: 'infrastructură',
  pollution: 'poluare',
  construction: 'construcții',
  traffic: 'trafic',
  flooding: 'inundație',
  obstruction: 'obstacol',
  lighting: 'iluminat',
  other: 'altele',
}

function detect(text: string) {
  const rule = CATEGORY_RULES.find((r) => r.words.some((w) => hasStem(text, w)))
  let severity: Severity = 'medium'
  if (HIGH_WORDS.some((w) => hasStem(text, w))) severity = 'high'
  else if (LOW_WORDS.some((w) => hasStem(text, w))) severity = 'low'
  return { rule, severity }
}

function capitalize(s: string) {
  const trimmed = s.trim().replace(/\s+/g, ' ')
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

export function mockIssueAgent(req: ChatRequest): ChatReply {
  // `history` include deja mesajul curent la final.
  const previous = req.history.slice(0, -1)
  const prevUser = [...previous].reverse().find((m) => m.role === 'user')
  const lastAssistant = [...previous].reverse().find((m) => m.role === 'assistant')
  // Combinăm mesajul curent cu cel anterior dacă LLM-ul a cerut clarificări.
  const needsContext = lastAssistant?.text.includes('Poți să-mi dai mai multe detalii')
  const text = needsContext && prevUser ? `${prevUser.text} ${req.message}` : req.message

  const words = text.trim().split(/\s+/).filter(Boolean)
  const { rule, severity } = detect(text)

  if (words.length < 3 || (!rule && words.length < 8)) {
    return {
      reply:
        'Poți să-mi dai mai multe detalii? Spune-mi ce fel de problemă ai observat (ex. groapă, inundație, fum, copac căzut, șantier) și cât de gravă ți se pare.',
    }
  }

  const category = rule?.category ?? 'other'
  const title = rule?.title ?? 'Problemă raportată'
  const issue: UserIssue = {
    id: `i-${crypto.randomUUID().slice(0, 8)}`,
    title,
    description: capitalize(text),
    category,
    severity,
    lat: req.location.lat,
    lng: req.location.lng,
    radius: 500,
    createdBy: req.userId,
    createdAt: new Date().toISOString(),
    resolveVotes: [],
    source: 'chat',
  }

  const sev = { low: 'scăzută', medium: 'medie', high: 'ridicată' }[severity]
  return {
    reply: `Mulțumesc! Am înregistrat problema ca „${title}” (categoria ${CATEGORY_LABEL[category]}, gravitate ${sev}) și am marcat pe hartă o zonă de 500 m în jurul locației tale. Rutele EcoPulse vor ține cont de ea. Dacă problema se rezolvă, o poți elimina direct de pe hartă.`,
    issue,
  }
}
