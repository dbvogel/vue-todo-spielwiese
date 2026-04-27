import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useStorage } from '@vueuse/core'

export type PaymentStatus = 'paid' | 'pending' | 'overdue'

export interface RentPayment {
  id: number
  tenant: string
  amount: number
  month: string // ISO yyyy-MM format
  paidAt: string | null
  status: PaymentStatus
}

export interface UtilityCost {
  id: number
  year: number
  category: string // 'Heizung' | 'Wasser' | 'Müll' | etc.
  totalCost: number
  tenantShare: number
  settled: boolean
}

export interface Document {
  id: number
  name: string
  category: string // 'Mietvertrag' | 'Nebenkostenabrechnung' | 'Sonstiges'
  addedAt: string
  notes: string
}

export interface Deadline {
  id: number
  title: string
  dueDate: string // ISO date
  done: boolean
  category: string // 'Steuer' | 'Versicherung' | 'Instandhaltung' | 'Sonstiges'
}

interface DemoPaymentEntry {
  tenant: string
  amount: number
  monthOffset: number
  paid: boolean
}

interface DemoUtilityEntry {
  yearOffset: number
  category: string
  totalCost: number
  tenantShare: number
  settled: boolean
}

interface DemoDocumentEntry {
  name: string
  category: string
  notes: string
  daysAgo: number
}

interface DemoDeadlineEntry {
  title: string
  dayOffset: number
  category: string
  done: boolean
}

const DEMO_PAYMENTS: DemoPaymentEntry[] = [
  { tenant: 'Anna Mueller', amount: 980, monthOffset: -2, paid: true },
  { tenant: 'Lukas Schneider', amount: 1040, monthOffset: -1, paid: true },
  { tenant: 'Sophie Fischer', amount: 920, monthOffset: 0, paid: false },
  { tenant: 'Maximilian Weber', amount: 1150, monthOffset: 0, paid: false },
  { tenant: 'Lea Wagner', amount: 990, monthOffset: 1, paid: false },
  { tenant: 'Noah Becker', amount: 1080, monthOffset: 1, paid: false },
]

const DEMO_UTILITIES: DemoUtilityEntry[] = [
  { yearOffset: -1, category: 'Heizung', totalCost: 4200, tenantShare: 2890, settled: true },
  { yearOffset: -1, category: 'Wasser', totalCost: 980, tenantShare: 740, settled: true },
  { yearOffset: 0, category: 'Strom', totalCost: 1580, tenantShare: 1130, settled: false },
  { yearOffset: 0, category: 'Muell', totalCost: 620, tenantShare: 460, settled: false },
  { yearOffset: 0, category: 'Versicherung', totalCost: 1340, tenantShare: 870, settled: false },
]

const DEMO_DOCUMENTS: DemoDocumentEntry[] = [
  { name: 'Mietvertrag Hauptstrasse 12 WE1', category: 'Mietvertrag', notes: 'Laufzeit unbefristet', daysAgo: 410 },
  { name: 'Nebenkostenabrechnung 2025', category: 'Nebenkostenabrechnung', notes: 'Versand bestaetigt', daysAgo: 75 },
  { name: 'Uebergabeprotokoll Lindenweg 8', category: 'Uebergabeprotokoll', notes: 'Zaehlerstaende dokumentiert', daysAgo: 240 },
  { name: 'Wohngebaeudeversicherung 2026', category: 'Versicherung', notes: 'Bis 31.12.2026 gueltig', daysAgo: 35 },
]

const DEMO_DEADLINES: DemoDeadlineEntry[] = [
  { title: 'Grundsteuer Vorauszahlung Q2', dayOffset: -5, category: 'Steuer', done: false },
  { title: 'Heizungswartung beauftragen', dayOffset: 4, category: 'Instandhaltung', done: false },
  { title: 'Wohngebaeudeversicherung pruefen', dayOffset: 12, category: 'Versicherung', done: false },
  { title: 'Mieterhoehung vorbereiten WE3', dayOffset: 24, category: 'Sonstiges', done: false },
  { title: 'Abrechnung 2025 finalisieren', dayOffset: -21, category: 'Steuer', done: true },
]

function makeSerializer<T>() {
  return {
    read: (v: string): T[] => {
      try { return JSON.parse(v) ?? [] } catch { return [] }
    },
    write: (v: T[]) => JSON.stringify(v),
  }
}

function addMonths(baseDate: Date, monthOffset: number) {
  const date = new Date(baseDate)
  date.setMonth(date.getMonth() + monthOffset)
  return date
}

function toMonthString(baseDate: Date, monthOffset: number) {
  const date = addMonths(baseDate, monthOffset)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  return `${year}-${month}`
}

function toDateString(baseDate: Date, dayOffset: number) {
  const date = new Date(baseDate)
  date.setDate(date.getDate() + dayOffset)
  return date.toISOString().slice(0, 10)
}

function toDateTimeString(baseDate: Date, dayOffset: number) {
  const date = new Date(baseDate)
  date.setDate(date.getDate() - dayOffset)
  return date.toISOString()
}

let _rentId = 0
let _utilId = 0
let _docId = 0
let _deadlineId = 0

export const useVermieterStore = defineStore('vermieter', () => {
  const payments = useStorage<RentPayment[]>('vm_payments', [], undefined, {
    serializer: makeSerializer<RentPayment>(),
  })
  const utilityCosts = useStorage<UtilityCost[]>('vm_utilities', [], undefined, {
    serializer: makeSerializer<UtilityCost>(),
  })
  const documents = useStorage<Document[]>('vm_documents', [], undefined, {
    serializer: makeSerializer<Document>(),
  })
  const deadlines = useStorage<Deadline[]>('vm_deadlines', [], undefined, {
    serializer: makeSerializer<Deadline>(),
  })

  // Derive next IDs from stored data on init
  _rentId = payments.value.reduce((m, p) => Math.max(m, p.id), 0) + 1
  _utilId = utilityCosts.value.reduce((m, u) => Math.max(m, u.id), 0) + 1
  _docId = documents.value.reduce((m, d) => Math.max(m, d.id), 0) + 1
  _deadlineId = deadlines.value.reduce((m, d) => Math.max(m, d.id), 0) + 1

  // ── Payments ────────────────────────────────────────────────
  const overdueCount = computed(
    () => payments.value.filter(p => p.status === 'overdue').length,
  )
  const pendingCount = computed(
    () => payments.value.filter(p => p.status === 'pending').length,
  )

  function addPayment(tenant: string, amount: number, month: string) {
    const today = new Date()
    const parts = month.split('-').map(Number)
    const y = parts[0] ?? new Date().getFullYear()
    const m = parts[1] ?? 1
    const dueDate = new Date(y, m - 1, 5) // assume rent is due 5th of month
    const status: PaymentStatus = today > dueDate ? 'overdue' : 'pending'

    payments.value.push({
      id: _rentId++,
      tenant,
      amount,
      month,
      paidAt: null,
      status,
    })
  }

  function markPaid(id: number) {
    const p = payments.value.find(p => p.id === id)
    if (p) {
      p.status = 'paid'
      p.paidAt = new Date().toISOString()
    }
  }

  function removePayment(id: number) {
    payments.value = payments.value.filter(p => p.id !== id)
  }

  // ── Utility Costs ───────────────────────────────────────────
  const unsettledUtilities = computed(
    () => utilityCosts.value.filter(u => !u.settled),
  )

  function addUtilityCost(
    year: number,
    category: string,
    totalCost: number,
    tenantShare: number,
  ) {
    utilityCosts.value.push({
      id: _utilId++,
      year,
      category,
      totalCost,
      tenantShare,
      settled: false,
    })
  }

  function settleUtility(id: number) {
    const u = utilityCosts.value.find(u => u.id === id)
    if (u) u.settled = true
  }

  function removeUtility(id: number) {
    utilityCosts.value = utilityCosts.value.filter(u => u.id !== id)
  }

  // ── Documents ───────────────────────────────────────────────
  function addDocument(name: string, category: string, notes: string = '') {
    documents.value.push({
      id: _docId++,
      name,
      category,
      notes,
      addedAt: new Date().toISOString(),
    })
  }

  function removeDocument(id: number) {
    documents.value = documents.value.filter(d => d.id !== id)
  }

  // ── Deadlines ───────────────────────────────────────────────
  const upcomingDeadlines = computed(() =>
    [...deadlines.value]
      .filter(d => !d.done)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 5),
  )

  const overdueDeadlines = computed(() => {
    const today = new Date().toISOString().slice(0, 10)
    return deadlines.value.filter(d => !d.done && d.dueDate < today)
  })

  function addDeadline(title: string, dueDate: string, category: string) {
    deadlines.value.push({
      id: _deadlineId++,
      title,
      dueDate,
      done: false,
      category,
    })
  }

  function completeDeadline(id: number) {
    const d = deadlines.value.find(d => d.id === id)
    if (d) d.done = true
  }

  function removeDeadline(id: number) {
    deadlines.value = deadlines.value.filter(d => d.id !== id)
  }

  function seedDemoData() {
    const now = new Date()

    if (payments.value.length === 0) {
      for (const entry of DEMO_PAYMENTS) {
        const month = toMonthString(now, entry.monthOffset)
        const status: PaymentStatus = entry.paid
          ? 'paid'
          : (entry.monthOffset < 0 ? 'overdue' : 'pending')

        payments.value.push({
          id: _rentId++,
          tenant: entry.tenant,
          amount: entry.amount,
          month,
          status,
          paidAt: entry.paid ? new Date().toISOString() : null,
        })
      }
    }

    if (utilityCosts.value.length === 0) {
      for (const entry of DEMO_UTILITIES) {
        utilityCosts.value.push({
          id: _utilId++,
          year: new Date().getFullYear() + entry.yearOffset,
          category: entry.category,
          totalCost: entry.totalCost,
          tenantShare: entry.tenantShare,
          settled: entry.settled,
        })
      }
    }

    if (documents.value.length === 0) {
      for (const entry of DEMO_DOCUMENTS) {
        documents.value.push({
          id: _docId++,
          name: entry.name,
          category: entry.category,
          notes: entry.notes,
          addedAt: toDateTimeString(now, entry.daysAgo),
        })
      }
    }

    if (deadlines.value.length === 0) {
      for (const entry of DEMO_DEADLINES) {
        deadlines.value.push({
          id: _deadlineId++,
          title: entry.title,
          dueDate: toDateString(now, entry.dayOffset),
          category: entry.category,
          done: entry.done,
        })
      }
    }
  }

  function resetAndSeedDemoData() {
    payments.value = []
    utilityCosts.value = []
    documents.value = []
    deadlines.value = []
    _rentId = 1
    _utilId = 1
    _docId = 1
    _deadlineId = 1
    seedDemoData()
  }

  return {
    // state
    payments,
    utilityCosts,
    documents,
    deadlines,
    // computed
    overdueCount,
    pendingCount,
    unsettledUtilities,
    upcomingDeadlines,
    overdueDeadlines,
    // actions
    addPayment,
    markPaid,
    removePayment,
    addUtilityCost,
    settleUtility,
    removeUtility,
    addDocument,
    removeDocument,
    addDeadline,
    completeDeadline,
    removeDeadline,
    seedDemoData,
    resetAndSeedDemoData,
  }
})
