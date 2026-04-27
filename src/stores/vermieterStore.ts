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

function makeSerializer<T>() {
  return {
    read: (v: string): T[] => {
      try { return JSON.parse(v) ?? [] } catch { return [] }
    },
    write: (v: T[]) => JSON.stringify(v),
  }
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
  }
})
