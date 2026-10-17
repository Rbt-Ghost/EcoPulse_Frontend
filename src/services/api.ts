import {
  mockConstructionZones,
  mockHazards,
  mockIssues,
  mockSensors,
} from '../data/mockData'
import type { ChatMessage, LatLng, MapData, UserIssue } from '../types'
import { mockIssueAgent } from './mockIssueAgent'

/**
 * Stratul de acces la date. Dacă `VITE_API_URL` este setat, toate apelurile merg
 * către backend; altfel se folosește o implementare mock persistată în localStorage.
 *
 * Contract REST așteptat de la backend:
 *   GET    /map-data                          -> MapData
 *   DELETE /issues/:id         (X-User-Id)    -> 204   (doar autorul)
 *   POST   /issues/:id/resolve (X-User-Id)    -> { issue: UserIssue | null }  (null = eliminat)
 *   POST   /issues/report-chat                -> ChatReply
 *          body: { message, history, location, userId }
 */
export const API_URL: string = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
export const USING_MOCK = !API_URL

/** Câte confirmări de la alți utilizatori sunt necesare ca un issue să dispară. */
export const RESOLVE_THRESHOLD = 3

export type ChatReply = { reply: string; issue?: UserIssue }

export type ChatRequest = {
  message: string
  history: Pick<ChatMessage, 'role' | 'text'>[]
  location: LatLng
  userId: string
}

export interface EcoPulseApi {
  getMapData(): Promise<MapData>
  deleteIssue(id: string, userId: string): Promise<void>
  voteResolve(id: string, userId: string): Promise<UserIssue | null>
  reportViaChat(req: ChatRequest): Promise<ChatReply>
}

// ---------------------------------------------------------------- utilizator

const USER_KEY = 'ecopulse.userId'

export function getUserId(): string {
  try {
    let id = localStorage.getItem(USER_KEY)
    if (!id) {
      id = `user-${crypto.randomUUID().slice(0, 8)}`
      localStorage.setItem(USER_KEY, id)
    }
    return id
  } catch {
    return 'user-anon'
  }
}

// ---------------------------------------------------------------- HTTP

async function http<T>(path: string, init: RequestInit = {}, userId?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { 'X-User-Id': userId } : {}),
      ...init.headers,
    },
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text().catch(() => '')}`)
  return res.status === 204 ? (undefined as T) : res.json()
}

const httpApi: EcoPulseApi = {
  getMapData: () => http<MapData>('/map-data'),
  deleteIssue: (id, userId) => http<void>(`/issues/${id}`, { method: 'DELETE' }, userId),
  voteResolve: async (id, userId) =>
    (await http<{ issue: UserIssue | null }>(`/issues/${id}/resolve`, { method: 'POST' }, userId))
      .issue,
  reportViaChat: (req) =>
    http<ChatReply>('/issues/report-chat', { method: 'POST', body: JSON.stringify(req) }),
}

// ---------------------------------------------------------------- mock

const ISSUES_KEY = 'ecopulse.issues.v1'
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

function loadIssues(): UserIssue[] {
  try {
    const raw = localStorage.getItem(ISSUES_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignorăm */
  }
  return mockIssues
}

function saveIssues(issues: UserIssue[]) {
  try {
    localStorage.setItem(ISSUES_KEY, JSON.stringify(issues))
  } catch {
    /* ignorăm */
  }
}

const mockApi: EcoPulseApi = {
  async getMapData() {
    await delay(350)
    // Mică variație pentru a simula date live de la senzori.
    const sensors = mockSensors.map((s) => {
      const jitter = 1 + (Math.random() - 0.5) * 0.12
      return { ...s, aqi: Math.round(s.aqi * jitter) }
    })
    return {
      sensors,
      hazards: mockHazards,
      constructionZones: mockConstructionZones,
      issues: loadIssues(),
    }
  },

  async deleteIssue(id, userId) {
    await delay(250)
    const issues = loadIssues()
    const issue = issues.find((i) => i.id === id)
    if (!issue) return
    if (issue.createdBy !== userId) throw new Error('Doar autorul poate șterge direct problema.')
    saveIssues(issues.filter((i) => i.id !== id))
  },

  async voteResolve(id, userId) {
    await delay(250)
    const issues = loadIssues()
    const issue = issues.find((i) => i.id === id)
    if (!issue) return null
    if (!issue.resolveVotes.includes(userId)) issue.resolveVotes.push(userId)
    if (issue.resolveVotes.length >= RESOLVE_THRESHOLD) {
      saveIssues(issues.filter((i) => i.id !== id))
      return null
    }
    saveIssues(issues)
    return { ...issue }
  },

  async reportViaChat(req) {
    await delay(900 + Math.random() * 600)
    const reply = mockIssueAgent(req)
    if (reply.issue) saveIssues([...loadIssues(), reply.issue])
    return reply
  },
}

export const api: EcoPulseApi = USING_MOCK ? mockApi : httpApi
