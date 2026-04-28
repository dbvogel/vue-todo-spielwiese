import { useStorage } from '@vueuse/core'
import { computed } from 'vue'

// ── AI Provider config (persisted) ───────────────────────────

export type AiProvider = 'local' | 'openai' | 'groq'

export interface AiConfig {
  provider: AiProvider
  openaiApiKey: string
  openaiModel: string
  groqApiKey: string
  groqModel: string
  localModel: string
}

export const aiConfig = useStorage<AiConfig>('vm_ai_config', {
  provider: 'local',
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  groqApiKey: '',
  groqModel: 'llama-3.3-70b-versatile',
  localModel: (import.meta.env.VITE_AI_MODEL as string | undefined)?.trim() || 'qwen2.5:7b-instruct',
})

export const aiProviderLabel = computed(() => {
  if (aiConfig.value.provider === 'openai') return '☁ OpenAI'
  if (aiConfig.value.provider === 'groq') return '⚡ Groq (kostenlos)'
  return '🖥 Lokal (Ollama)'
})

// ── Internal chat function ────────────────────────────────────

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface OllamaResponse {
  message: { content: string }
}

interface OpenAIResponse {
  choices: [{ message: { content: string } }]
}

async function chat(systemPrompt: string, userMessage: string): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ]

  if (aiConfig.value.provider === 'openai') {
    if (!aiConfig.value.openaiApiKey) {
      throw new Error('Kein OpenAI API-Key gesetzt. Bitte in den KI-Einstellungen eintragen.')
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiConfig.value.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: aiConfig.value.openaiModel,
        messages,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`OpenAI Fehler ${response.status}: ${err}`)
    }

    const data = (await response.json()) as OpenAIResponse
    return data.choices[0].message.content
  }

  if (aiConfig.value.provider === 'groq') {
    if (!aiConfig.value.groqApiKey) {
      throw new Error('Kein Groq API-Key gesetzt. Kostenlosen Key unter console.groq.com erstellen.')
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiConfig.value.groqApiKey}`,
      },
      body: JSON.stringify({
        model: aiConfig.value.groqModel,
        messages,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Groq Fehler ${response.status}: ${err}`)
    }

    const data = (await response.json()) as OpenAIResponse
    return data.choices[0].message.content
  }

  // Local Ollama
  const endpoint = (import.meta.env.VITE_CHAT_ENDPOINT as string | undefined)?.trim() || '/api/chat'
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: aiConfig.value.localModel,
      stream: false,
      messages,
    }),
  })

  if (!response.ok) {
    throw new Error(`Ollama Fehler ${response.status}`)
  }

  const data = (await response.json()) as OllamaResponse
  return data.message.content
}

// ── Multi-turn chat (exported for chat UI) ────────────────────

export type ChatRole = 'user' | 'assistant'

export interface ChatTurn {
  role: ChatRole
  content: string
}

export async function chatWithHistory(
  systemPrompt: string,
  history: ChatTurn[],
  userMessage: string,
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.map(t => ({ role: t.role, content: t.content })),
    { role: 'user', content: userMessage },
  ]

  if (aiConfig.value.provider === 'openai') {
    if (!aiConfig.value.openaiApiKey) {
      throw new Error('Kein OpenAI API-Key gesetzt. Bitte in den KI-Einstellungen eintragen.')
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiConfig.value.openaiApiKey}`,
      },
      body: JSON.stringify({ model: aiConfig.value.openaiModel, messages }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`OpenAI Fehler ${response.status}: ${err}`)
    }

    const data = (await response.json()) as OpenAIResponse
    return data.choices[0].message.content
  }

  if (aiConfig.value.provider === 'groq') {
    if (!aiConfig.value.groqApiKey) {
      throw new Error('Kein Groq API-Key gesetzt. Kostenlosen Key unter console.groq.com erstellen.')
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aiConfig.value.groqApiKey}`,
      },
      body: JSON.stringify({ model: aiConfig.value.groqModel, messages }),
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`Groq Fehler ${response.status}: ${err}`)
    }

    const data = (await response.json()) as OpenAIResponse
    return data.choices[0].message.content
  }

  const endpoint = (import.meta.env.VITE_CHAT_ENDPOINT as string | undefined)?.trim() || '/api/chat'
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: aiConfig.value.localModel, stream: false, messages }),
  })

  if (!response.ok) throw new Error(`Ollama Fehler ${response.status}`)

  const data = (await response.json()) as OllamaResponse
  return data.message.content
}

function extractJson(raw: string): string {
  // Try to find the first {...} block in case the model adds preamble text
  const match = raw.match(/\{[\s\S]*\}/)
  if (match) return match[0]
  // Fallback: strip markdown code fences
  return raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()
}

// ── Document metadata suggestion ─────────────────────────────

export interface DocSuggestion {
  category: string
  notes: string
}

const DOC_CATEGORIES = [
  'Mietvertrag',
  'Nebenkostenabrechnung',
  'Übergabeprotokoll',
  'Versicherung',
  'Sonstiges',
]

export async function suggestDocumentMetadata(docName: string): Promise<DocSuggestion> {
  const systemPrompt = [
    'Du bist ein Assistent für private Vermieter.',
    'Analysiere den Dokumentnamen und antworte ausschließlich mit einem kompakten JSON-Objekt ohne Markdown-Blöcke.',
    `Erlaubte Kategorien: ${DOC_CATEGORIES.join(', ')}.`,
    'Format: {"category": "<Kategorie>", "notes": "<kurze Notiz auf Deutsch, max. 60 Zeichen>"}',
  ].join('\n')

  const raw = await chat(systemPrompt, docName)
  const parsed = JSON.parse(extractJson(raw)) as DocSuggestion

  if (!DOC_CATEGORIES.includes(parsed.category)) {
    parsed.category = 'Sonstiges'
  }

  return parsed
}

// ── Natural language deadline parsing ────────────────────────

export interface DeadlineParsed {
  title: string
  dueDate: string // YYYY-MM-DD
  category: string
}

const DEADLINE_CATEGORIES = ['Steuer', 'Versicherung', 'Instandhaltung', 'Kündigung', 'Sonstiges']

export async function parseNaturalDeadline(input: string): Promise<DeadlineParsed> {
  const today = new Date().toISOString().slice(0, 10)
  const systemPrompt = [
    `Heute ist ${today}.`,
    'Du bist ein Assistent für private Vermieter.',
    'Extrahiere eine Frist aus dem Text und antworte ausschließlich mit einem kompakten JSON-Objekt ohne Markdown-Blöcke.',
    `Erlaubte Kategorien: ${DEADLINE_CATEGORIES.join(', ')}.`,
    'Format: {"title": "<Titel>", "dueDate": "<YYYY-MM-DD>", "category": "<Kategorie>"}',
  ].join('\n')

  const raw = await chat(systemPrompt, input)
  const parsed = JSON.parse(extractJson(raw)) as DeadlineParsed

  if (!DEADLINE_CATEGORIES.includes(parsed.category)) {
    parsed.category = 'Sonstiges'
  }

  return parsed
}

// ── Dashboard summary ─────────────────────────────────────────

export interface DashboardData {
  overdueCount: number
  pendingCount: number
  openRentAmount: number
  unsettledUtilitiesCount: number
  overdueDeadlinesCount: number
  upcomingDeadlinesCount: number
}

export async function generateDashboardSummary(data: DashboardData): Promise<string> {
  const systemPrompt = [
    'Du bist ein Assistent für private Vermieter.',
    'Schreibe eine kurze, prägnante Zusammenfassung (max. 3 Sätze) auf Deutsch über den aktuellen Portfolio-Status.',
    'Nur Fließtext, keine Aufzählungen, keine Markdown-Formatierung.',
  ].join('\n')

  return await chat(systemPrompt, JSON.stringify(data))
}

// ── Monthly report ────────────────────────────────────────────

export interface MonthlyReportPayment {
  tenant: string
  amount: number
  status: 'paid' | 'pending' | 'overdue'
  month: string
}

export interface MonthlyReportUtility {
  category: string
  year: number
  totalCost: number
  tenantShare: number
  settled: boolean
}

export interface MonthlyReportDeadline {
  title: string
  dueDate: string
  category: string
  overdue: boolean
}

export interface MonthlyReportData {
  reportMonth: string          // e.g. "April 2026"
  currentMonthPayments: MonthlyReportPayment[]
  overduePayments: MonthlyReportPayment[]
  unsettledUtilities: MonthlyReportUtility[]
  upcomingDeadlines: MonthlyReportDeadline[]
  overdueDeadlines: MonthlyReportDeadline[]
  totalCollected: number
  totalOpen: number
}

export async function generateMonthlyReport(data: MonthlyReportData): Promise<string> {
  const systemPrompt = [
    'Du bist ein professioneller Assistent für private Vermieter.',
    `Erstelle einen strukturierten Monatsbericht für ${data.reportMonth} auf Deutsch.`,
    'Gliedere den Bericht in diese Abschnitte (jeweils mit einer Überschrift wie "## Abschnitt"):',
    '1. Zusammenfassung – kurze Gesamtbewertung (2-3 Sätze)',
    '2. Mietzahlungen – Tabelle aller Mieter des Monats mit Status',
    '3. Offene Forderungen – überfällige Zahlungen aus Vormonaten',
    '4. Nebenkosten – offene NK-Positionen',
    '5. Fristen – was in den nächsten 30 Tagen ansteht',
    '6. Empfohlene Maßnahmen – konkrete Aufgabenliste mit Priorität',
    'Verwende einfaches Markdown (##, -, **fett**). Sei präzise und professionell.',
  ].join('\n')

  return await chat(systemPrompt, JSON.stringify(data))
}
