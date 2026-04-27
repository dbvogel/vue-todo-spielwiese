<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useVermieterStore } from '../stores/vermieterStore'
import { useCustomersStore } from '../stores/customersStore'
import { flushCustomerSyncQueue, isCustomerSyncConfigured } from '../services/customersSyncService'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const store = useVermieterStore()
const customersStore = useCustomersStore()

const deferredInstallPrompt = ref<BeforeInstallPromptEvent | null>(null)
const isInstalled = ref(false)
const isInstalling = ref(false)
const isDarkMode = ref(false)

const canInstall = computed(() => !isInstalled.value && deferredInstallPrompt.value !== null)

function detectInstalledState() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
  const isIosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  isInstalled.value = isStandalone || isIosStandalone
}

function onBeforeInstallPrompt(event: Event) {
  event.preventDefault()
  deferredInstallPrompt.value = event as BeforeInstallPromptEvent
}

function onAppInstalled() {
  isInstalled.value = true
  deferredInstallPrompt.value = null
}

function applyTheme(mode: 'dark' | 'light') {
  isDarkMode.value = mode === 'dark'
  document.documentElement.classList.toggle('theme-dark', isDarkMode.value)
}

function initializeTheme() {
  const saved = localStorage.getItem('vm_theme')
  if (saved === 'dark' || saved === 'light') {
    applyTheme(saved)
    return
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  applyTheme(prefersDark ? 'dark' : 'light')
}

function toggleTheme() {
  const next = isDarkMode.value ? 'light' : 'dark'
  applyTheme(next)
  localStorage.setItem('vm_theme', next)
}

async function installApp() {
  if (!deferredInstallPrompt.value || isInstalling.value) return

  isInstalling.value = true
  try {
    await deferredInstallPrompt.value.prompt()
    const choice = await deferredInstallPrompt.value.userChoice
    if (choice.outcome !== 'accepted') return
    deferredInstallPrompt.value = null
  } finally {
    isInstalling.value = false
  }
}

onMounted(() => {
  initializeTheme()
  detectInstalledState()
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.addEventListener('appinstalled', onAppInstalled)
  window.addEventListener('online', onOnline)
  void initializeCustomers()
  void syncCustomers()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.removeEventListener('appinstalled', onAppInstalled)
  window.removeEventListener('online', onOnline)
})

// ── Tab state ─────────────────────────────────────────────────
type Tab = 'dashboard' | 'miete' | 'nebenkosten' | 'dokumente' | 'fristen' | 'objekte' | 'kunden'
const activeTab = ref<Tab>('dashboard')

// ── Kunden: add customer form ─────────────────────────────────
const customerName = ref('')
const customerEmail = ref('')
const customerPhone = ref('')
const customerProperty = ref('')
const customerNotes = ref('')
const customerFormError = ref<string | null>(null)
const isSyncingCustomers = ref(false)
const isResettingCustomers = ref(false)
const isResettingAllDemoData = ref(false)
const customerSyncConfigured = isCustomerSyncConfigured()

async function initializeCustomers() {
  try {
    store.seedDemoData()
    await customersStore.loadCustomers()
    await customersStore.seedGermanDemoCustomers()
  } catch {
    customerFormError.value = customersStore.errorMessage ?? 'Kundendaten konnten nicht initialisiert werden.'
  }
}

async function submitCustomer() {
  if (!customerName.value.trim()) {
    customerFormError.value = 'Name ist erforderlich.'
    return
  }

  customerFormError.value = null

  try {
    await customersStore.saveCustomer({
      name: customerName.value,
      email: customerEmail.value,
      phone: customerPhone.value,
      propertyLabel: customerProperty.value,
      notes: customerNotes.value,
    })

    customerName.value = ''
    customerEmail.value = ''
    customerPhone.value = ''
    customerProperty.value = ''
    customerNotes.value = ''
  } catch {
    customerFormError.value = customersStore.errorMessage ?? 'Kunde konnte nicht gespeichert werden.'
  }
}

async function resetDemoCustomers() {
  if (isResettingCustomers.value) return

  customerFormError.value = null
  isResettingCustomers.value = true
  try {
    const created = await customersStore.resetAndSeedGermanDemoCustomers()
    await syncCustomers()
    customerFormError.value = created > 0 ? null : 'Keine Demo-Kunden erstellt.'
  } catch {
    customerFormError.value = customersStore.errorMessage ?? 'Demo-Kunden konnten nicht neu erstellt werden.'
  } finally {
    isResettingCustomers.value = false
  }
}

async function resetAllDemoData() {
  if (isResettingAllDemoData.value) return

  customerFormError.value = null
  isResettingAllDemoData.value = true
  try {
    store.resetAndSeedDemoData()
    await customersStore.resetAndSeedGermanDemoCustomers()
    await syncCustomers()
  } catch (error) {
    customerFormError.value =
      customersStore.errorMessage ||
      (error instanceof Error ? error.message : 'Demo-Daten konnten nicht komplett neu erstellt werden.')
  } finally {
    isResettingAllDemoData.value = false
  }
}

async function removeCustomer(id: string) {
  await customersStore.removeCustomer(id)
}

async function syncCustomers() {
  if (isSyncingCustomers.value) return
  if (!customerSyncConfigured) return

  isSyncingCustomers.value = true
  try {
    await flushCustomerSyncQueue()
    await customersStore.refreshPendingSyncCount()
  } finally {
    isSyncingCustomers.value = false
  }
}

function onOnline() {
  void syncCustomers()
}

const objectsOverview = computed(() => {
  const grouped = new Map<string, string[]>()

  for (const customer of customersStore.customers) {
    const objectLabel = customer.propertyLabel.trim() || 'Ohne Objekt'
    const entries = grouped.get(objectLabel) ?? []
    entries.push(customer.name)
    grouped.set(objectLabel, entries)
  }

  return Array.from(grouped.entries())
    .map(([objectLabel, names]) => ({
      objectLabel,
      count: names.length,
      names: [...names].sort((a, b) => a.localeCompare(b, 'de')),
    }))
    .sort((a, b) => a.objectLabel.localeCompare(b.objectLabel, 'de'))
})

const currentMonth = computed(() => new Date().toISOString().slice(0, 7))

const openRentAmount = computed(() =>
  store.payments
    .filter(p => p.status !== 'paid')
    .reduce((sum, p) => sum + p.amount, 0),
)

const currentMonthCollected = computed(() =>
  store.payments
    .filter(p => p.month === currentMonth.value && p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0),
)

const currentMonthOpen = computed(() =>
  store.payments
    .filter(p => p.month === currentMonth.value && p.status !== 'paid')
    .reduce((sum, p) => sum + p.amount, 0),
)

const openUtilityAmount = computed(() =>
  store.utilityCosts
    .filter(u => !u.settled)
    .reduce((sum, u) => sum + u.tenantShare, 0),
)

const overduePayments = computed(() =>
  store.payments
    .filter(p => p.status === 'overdue')
    .slice()
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 5),
)

const recentDocuments = computed(() =>
  store.documents
    .slice()
    .sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime())
    .slice(0, 4),
)

const topObjects = computed(() =>
  objectsOverview.value
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, 5),
)

// ── Miete: add payment form ───────────────────────────────────
const newTenant = ref('')
const newAmount = ref<number | null>(null)
const newMonth = ref(new Date().toISOString().slice(0, 7))

function submitPayment() {
  if (!newTenant.value.trim() || !newAmount.value || !newMonth.value) return
  store.addPayment(newTenant.value.trim(), newAmount.value, newMonth.value)
  newTenant.value = ''
  newAmount.value = null
  newMonth.value = new Date().toISOString().slice(0, 7)
}

// ── Nebenkosten: add utility form ─────────────────────────────
const utilYear = ref(new Date().getFullYear())
const utilCategory = ref('Heizung')
const utilTotal = ref<number | null>(null)
const utilShare = ref<number | null>(null)
const utilCategories = ['Heizung', 'Wasser', 'Müll', 'Strom', 'Versicherung', 'Sonstiges']

function submitUtility() {
  if (!utilTotal.value || !utilShare.value) return
  store.addUtilityCost(utilYear.value, utilCategory.value, utilTotal.value, utilShare.value)
  utilTotal.value = null
  utilShare.value = null
}

// ── Dokumente: add document form ──────────────────────────────
const docName = ref('')
const docCategory = ref('Mietvertrag')
const docNotes = ref('')
const docCategories = ['Mietvertrag', 'Nebenkostenabrechnung', 'Übergabeprotokoll', 'Versicherung', 'Sonstiges']

function submitDocument() {
  if (!docName.value.trim()) return
  store.addDocument(docName.value.trim(), docCategory.value, docNotes.value.trim())
  docName.value = ''
  docNotes.value = ''
}

// ── Fristen: add deadline form ────────────────────────────────
const deadlineTitle = ref('')
const deadlineDue = ref('')
const deadlineCategory = ref('Steuer')
const deadlineCategories = ['Steuer', 'Versicherung', 'Instandhaltung', 'Kündigung', 'Sonstiges']

function submitDeadline() {
  if (!deadlineTitle.value.trim() || !deadlineDue.value) return
  store.addDeadline(deadlineTitle.value.trim(), deadlineDue.value, deadlineCategory.value)
  deadlineTitle.value = ''
  deadlineDue.value = ''
}

// ── Helpers ───────────────────────────────────────────────────
function statusColor(status: string) {
  if (status === 'paid') return 'vm-badge-green'
  if (status === 'overdue') return 'vm-badge-red'
  return 'vm-badge-yellow'
}

function statusLabel(status: string) {
  if (status === 'paid') return 'Bezahlt'
  if (status === 'overdue') return 'Überfällig'
  return 'Ausstehend'
}

function formatMonth(m: string) {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1).toLocaleDateString('de-DE', {
    month: 'short',
    year: 'numeric',
  })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function daysUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now()
  return Math.ceil(diff / 86_400_000)
}

function deadlineUrgency(dueDate: string) {
  const d = daysUntil(dueDate)
  if (d < 0) return 'vm-badge-red'
  if (d <= 7) return 'vm-badge-yellow'
  return 'vm-badge-blue'
}

const totalPending = computed(
  () => store.payments.filter(p => p.status !== 'paid').reduce((s, p) => s + p.amount, 0),
)

const todayLabel = computed(() =>
  new Date().toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }),
)
</script>

<template>
  <section class="tile vermieter-tile reveal-in" style="animation-delay: 220ms;">
    <!-- Header -->
    <div class="vm-header">
      <div class="vm-brand">
        <img src="/vermieter-logo.svg" alt="Vermieter-Tool Logo" class="vm-brand-logo" />
        <div class="vm-brand-copy">
          <p class="vm-brand-kicker">Property Operations Suite</p>
          <h2 class="vm-brand-title">Vermieter-Tool Pro</h2>
          <p class="vm-brand-date">{{ todayLabel }}</p>
        </div>
      </div>
      <div class="vm-summary-pills">
        <button
          type="button"
          class="vm-theme-btn"
          @click="toggleTheme"
        >
          {{ isDarkMode ? '☀ Hell' : '🌙 Dunkel' }}
        </button>
        <button
          type="button"
          class="vm-install-btn"
          :disabled="isResettingAllDemoData"
          @click="resetAllDemoData"
        >
          {{ isResettingAllDemoData ? 'Fuelle Daten...' : 'Alle Demo-Daten fuellen' }}
        </button>
        <button
          v-if="canInstall"
          type="button"
          class="vm-install-btn"
          :disabled="isInstalling"
          @click="installApp"
        >
          {{ isInstalling ? 'Installiere...' : 'App installieren' }}
        </button>
        <span v-if="store.overdueCount > 0" class="vm-badge vm-badge-red">
          {{ store.overdueCount }} überfällig
        </span>
        <span v-if="store.overdueDeadlines.length > 0" class="vm-badge vm-badge-red">
          {{ store.overdueDeadlines.length }} Frist!
        </span>
        <span class="vm-badge vm-badge-blue">
          {{ store.pendingCount + store.overdueCount }} offen
        </span>
      </div>
    </div>

    <!-- Tabs -->
    <div class="vm-tabs">
      <button
        v-for="tab in (['dashboard', 'miete', 'nebenkosten', 'dokumente', 'fristen', 'objekte', 'kunden'] as const)"
        :key="tab"
        @click="activeTab = tab"
        :class="['vm-tab', activeTab === tab ? 'vm-tab-active' : '']"
      >
        <span v-if="tab === 'dashboard'">📊 Dashboard</span>
        <span v-else-if="tab === 'miete'">🏠 Miete</span>
        <span v-else-if="tab === 'nebenkosten'">💧 NK</span>
        <span v-else-if="tab === 'dokumente'">📄 Docs</span>
        <span v-else-if="tab === 'fristen'">⏰ Fristen</span>
        <span v-else-if="tab === 'objekte'">🏢 Objekte</span>
        <span v-else>👤 Kunden</span>
      </button>
    </div>

    <!-- ── TAB: DASHBOARD ─────────────────────────────────── -->
    <div v-if="activeTab === 'dashboard'" class="vm-tab-content">
      <div class="vm-dashboard-grid">
        <article class="vm-stat-card">
          <p class="vm-stat-label">Offene Miete</p>
          <p class="vm-stat-value">{{ openRentAmount.toFixed(2) }} €</p>
          <span class="vm-badge vm-badge-red">{{ store.pendingCount + store.overdueCount }} Vorgaenge</span>
        </article>

        <article class="vm-stat-card">
          <p class="vm-stat-label">Monat bezahlt</p>
          <p class="vm-stat-value">{{ currentMonthCollected.toFixed(2) }} €</p>
          <span class="vm-badge vm-badge-green">{{ formatMonth(currentMonth) }}</span>
        </article>

        <article class="vm-stat-card">
          <p class="vm-stat-label">Monat offen</p>
          <p class="vm-stat-value">{{ currentMonthOpen.toFixed(2) }} €</p>
          <span class="vm-badge vm-badge-yellow">{{ formatMonth(currentMonth) }}</span>
        </article>

        <article class="vm-stat-card">
          <p class="vm-stat-label">NK offen</p>
          <p class="vm-stat-value">{{ openUtilityAmount.toFixed(2) }} €</p>
          <span class="vm-badge vm-badge-blue">{{ store.unsettledUtilities.length }} Positionen</span>
        </article>

        <article class="vm-stat-card">
          <p class="vm-stat-label">Kunden</p>
          <p class="vm-stat-value">{{ customersStore.customerCount }}</p>
          <span class="vm-badge vm-badge-blue">{{ objectsOverview.length }} Objekte</span>
        </article>

        <article class="vm-stat-card">
          <p class="vm-stat-label">Offene Fristen</p>
          <p class="vm-stat-value">{{ store.deadlines.filter(d => !d.done).length }}</p>
          <span :class="['vm-badge', store.overdueDeadlines.length > 0 ? 'vm-badge-red' : 'vm-badge-green']">
            {{ store.overdueDeadlines.length }} ueberfaellig
          </span>
        </article>
      </div>

      <div class="vm-dashboard-panels">
        <section class="vm-dashboard-panel">
          <h3 class="vm-panel-title">Dringende Mieten</h3>
          <ul class="vm-list">
            <li v-if="overduePayments.length === 0" class="vm-empty">Keine ueberfaelligen Mieten.</li>
            <li v-for="p in overduePayments" :key="`overdue-${p.id}`" class="vm-item">
              <div class="vm-item-main">
                <span class="text-xs font-semibold text-slate-800">{{ p.tenant }}</span>
                <span class="text-xs text-slate-500">{{ formatMonth(p.month) }}</span>
              </div>
              <div class="vm-item-actions">
                <span class="text-xs font-bold">{{ p.amount.toFixed(2) }} €</span>
                <span class="vm-badge vm-badge-red">Ueberfaellig</span>
              </div>
            </li>
          </ul>
        </section>

        <section class="vm-dashboard-panel">
          <h3 class="vm-panel-title">Naechste Fristen</h3>
          <ul class="vm-list">
            <li v-if="store.upcomingDeadlines.length === 0" class="vm-empty">Keine offenen Fristen.</li>
            <li v-for="d in store.upcomingDeadlines" :key="`dash-deadline-${d.id}`" class="vm-item">
              <div class="vm-item-main">
                <span class="text-xs font-semibold text-slate-800">{{ d.title }}</span>
                <span class="text-xs text-slate-500">{{ d.category }}</span>
              </div>
              <div class="vm-item-actions">
                <span :class="['vm-badge', deadlineUrgency(d.dueDate)]">{{ formatDate(d.dueDate) }}</span>
              </div>
            </li>
          </ul>
        </section>

        <section class="vm-dashboard-panel">
          <h3 class="vm-panel-title">Aktuelle Dokumente</h3>
          <ul class="vm-list">
            <li v-if="recentDocuments.length === 0" class="vm-empty">Noch keine Dokumente.</li>
            <li v-for="doc in recentDocuments" :key="`dash-doc-${doc.id}`" class="vm-item">
              <div class="vm-item-main">
                <span class="text-xs font-semibold text-slate-800">{{ doc.name }}</span>
                <span class="text-xs text-slate-500">{{ doc.category }}</span>
              </div>
              <div class="vm-item-actions">
                <span class="text-xs text-slate-400">{{ formatDate(doc.addedAt) }}</span>
              </div>
            </li>
          </ul>
        </section>

        <section class="vm-dashboard-panel">
          <h3 class="vm-panel-title">Objekte mit Auslastung</h3>
          <ul class="vm-list">
            <li v-if="topObjects.length === 0" class="vm-empty">Keine Objekte vorhanden.</li>
            <li v-for="obj in topObjects" :key="`dash-object-${obj.objectLabel}`" class="vm-item">
              <div class="vm-item-main">
                <span class="text-xs font-semibold text-slate-800">{{ obj.objectLabel }}</span>
                <span class="text-xs text-slate-500">{{ obj.names.join(', ') }}</span>
              </div>
              <div class="vm-item-actions">
                <span class="vm-badge vm-badge-blue">{{ obj.count }} Mieter</span>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </div>

    <!-- ── TAB: MIETE ─────────────────────────────────────── -->
    <div v-else-if="activeTab === 'miete'" class="vm-tab-content">
      <!-- Add form -->
      <div class="vm-form">
        <input v-model="newTenant" type="text" placeholder="Mieter" class="vm-input" />
        <input v-model.number="newAmount" type="number" placeholder="Betrag €" class="vm-input vm-input-sm" />
        <input v-model="newMonth" type="month" class="vm-input vm-input-sm" />
        <button @click="submitPayment" class="vm-btn-add" :disabled="!newTenant || !newAmount">+</button>
      </div>

      <!-- Summary -->
      <div v-if="totalPending > 0" class="vm-summary-row">
        <span class="text-xs text-slate-500">Noch ausstehend:</span>
        <span class="text-xs font-bold text-red-600">{{ totalPending.toFixed(2) }} €</span>
      </div>

      <!-- List -->
      <ul class="vm-list">
        <li v-if="store.payments.length === 0" class="vm-empty">Noch keine Zahlungen erfasst.</li>
        <li
          v-for="p in [...store.payments].reverse()"
          :key="p.id"
          class="vm-item"
        >
          <div class="vm-item-main">
            <span class="text-xs font-semibold text-slate-800">{{ p.tenant }}</span>
            <span class="text-xs text-slate-500">{{ formatMonth(p.month) }}</span>
          </div>
          <div class="vm-item-actions">
            <span class="text-xs font-bold">{{ p.amount.toFixed(2) }} €</span>
            <span :class="['vm-badge', statusColor(p.status)]">{{ statusLabel(p.status) }}</span>
            <button
              v-if="p.status !== 'paid'"
              @click="store.markPaid(p.id)"
              class="vm-btn-small vm-btn-green"
            >✓</button>
            <button @click="store.removePayment(p.id)" class="vm-btn-small vm-btn-red">✕</button>
          </div>
        </li>
      </ul>
    </div>

    <!-- ── TAB: NEBENKOSTEN ───────────────────────────────── -->
    <div v-else-if="activeTab === 'nebenkosten'" class="vm-tab-content">
      <div class="vm-form">
        <input v-model.number="utilYear" type="number" placeholder="Jahr" class="vm-input vm-input-xs" />
        <select v-model="utilCategory" class="vm-input vm-input-sm">
          <option v-for="c in utilCategories" :key="c">{{ c }}</option>
        </select>
        <input v-model.number="utilTotal" type="number" placeholder="Gesamt €" class="vm-input vm-input-sm" />
        <input v-model.number="utilShare" type="number" placeholder="Mieteranteil €" class="vm-input vm-input-sm" />
        <button @click="submitUtility" class="vm-btn-add" :disabled="!utilTotal || !utilShare">+</button>
      </div>

      <ul class="vm-list">
        <li v-if="store.utilityCosts.length === 0" class="vm-empty">Noch keine NK erfasst.</li>
        <li
          v-for="u in [...store.utilityCosts].reverse()"
          :key="u.id"
          class="vm-item"
        >
          <div class="vm-item-main">
            <span class="text-xs font-semibold text-slate-800">{{ u.category }}</span>
            <span class="text-xs text-slate-500">{{ u.year }}</span>
          </div>
          <div class="vm-item-actions">
            <span class="text-xs">{{ u.tenantShare.toFixed(2) }} / {{ u.totalCost.toFixed(2) }} €</span>
            <span :class="['vm-badge', u.settled ? 'vm-badge-green' : 'vm-badge-yellow']">
              {{ u.settled ? 'Abgerechnet' : 'Offen' }}
            </span>
            <button
              v-if="!u.settled"
              @click="store.settleUtility(u.id)"
              class="vm-btn-small vm-btn-green"
            >✓</button>
            <button @click="store.removeUtility(u.id)" class="vm-btn-small vm-btn-red">✕</button>
          </div>
        </li>
      </ul>
    </div>

    <!-- ── TAB: DOKUMENTE ─────────────────────────────────── -->
    <div v-else-if="activeTab === 'dokumente'" class="vm-tab-content">
      <div class="vm-form">
        <input v-model="docName" type="text" placeholder="Dokumentname" class="vm-input" />
        <select v-model="docCategory" class="vm-input vm-input-sm">
          <option v-for="c in docCategories" :key="c">{{ c }}</option>
        </select>
        <input v-model="docNotes" type="text" placeholder="Notiz (optional)" class="vm-input" />
        <button @click="submitDocument" class="vm-btn-add" :disabled="!docName">+</button>
      </div>

      <ul class="vm-list">
        <li v-if="store.documents.length === 0" class="vm-empty">Kein Dokument archiviert.</li>
        <li
          v-for="d in [...store.documents].reverse()"
          :key="d.id"
          class="vm-item"
        >
          <div class="vm-item-main">
            <span class="text-xs font-semibold text-slate-800">{{ d.name }}</span>
            <span class="text-xs text-slate-500">{{ d.category }}</span>
          </div>
          <div class="vm-item-actions">
            <span class="text-xs text-slate-400">{{ formatDate(d.addedAt) }}</span>
            <button @click="store.removeDocument(d.id)" class="vm-btn-small vm-btn-red">✕</button>
          </div>
        </li>
      </ul>
    </div>

    <!-- ── TAB: FRISTEN ───────────────────────────────────── -->
    <div v-else-if="activeTab === 'fristen'" class="vm-tab-content">
      <div class="vm-form">
        <input v-model="deadlineTitle" type="text" placeholder="Frist/Aufgabe" class="vm-input" />
        <input v-model="deadlineDue" type="date" class="vm-input vm-input-sm" />
        <select v-model="deadlineCategory" class="vm-input vm-input-sm">
          <option v-for="c in deadlineCategories" :key="c">{{ c }}</option>
        </select>
        <button @click="submitDeadline" class="vm-btn-add" :disabled="!deadlineTitle || !deadlineDue">+</button>
      </div>

      <ul class="vm-list">
        <li v-if="store.deadlines.filter(d => !d.done).length === 0 && store.deadlines.length === 0" class="vm-empty">
          Keine Fristen erfasst.
        </li>
        <li
          v-for="d in store.upcomingDeadlines"
          :key="d.id"
          class="vm-item"
        >
          <div class="vm-item-main">
            <span class="text-xs font-semibold text-slate-800">{{ d.title }}</span>
            <span class="text-xs text-slate-500">{{ d.category }}</span>
          </div>
          <div class="vm-item-actions">
            <span :class="['vm-badge', deadlineUrgency(d.dueDate)]">
              {{ formatDate(d.dueDate) }}
              <span v-if="daysUntil(d.dueDate) >= 0"> ({{ daysUntil(d.dueDate) }}d)</span>
              <span v-else> (überfällig)</span>
            </span>
            <button @click="store.completeDeadline(d.id)" class="vm-btn-small vm-btn-green">✓</button>
            <button @click="store.removeDeadline(d.id)" class="vm-btn-small vm-btn-red">✕</button>
          </div>
        </li>
        <!-- Done items -->
        <li
          v-for="d in store.deadlines.filter(d => d.done)"
          :key="'done-' + d.id"
          class="vm-item vm-item-done"
        >
          <div class="vm-item-main">
            <span class="text-xs line-through text-slate-400">{{ d.title }}</span>
          </div>
          <div class="vm-item-actions">
            <button @click="store.removeDeadline(d.id)" class="vm-btn-small vm-btn-red">✕</button>
          </div>
        </li>
      </ul>
    </div>

    <!-- ── TAB: OBJEKTE ───────────────────────────────────── -->
    <div v-else-if="activeTab === 'objekte'" class="vm-tab-content">
      <div class="vm-summary-row">
        <span class="text-xs text-slate-500">{{ objectsOverview.length }} Objekte mit Kundenbezug</span>
        <span class="text-xs font-semibold text-slate-700">{{ customersStore.customerCount }} Kunden gesamt</span>
      </div>

      <ul class="vm-list">
        <li v-if="customersStore.isLoading" class="vm-empty">Objekte werden geladen...</li>
        <li v-else-if="objectsOverview.length === 0" class="vm-empty">Noch keine Objekte vorhanden.</li>
        <li v-for="obj in objectsOverview" :key="obj.objectLabel" class="vm-item">
          <div class="vm-item-main">
            <span class="text-xs font-semibold text-slate-800">{{ obj.objectLabel }}</span>
            <span class="text-xs text-slate-500">{{ obj.count }} Mieter</span>
            <span class="text-xs text-slate-400">{{ obj.names.join(', ') }}</span>
          </div>
          <div class="vm-item-actions">
            <span class="vm-badge vm-badge-blue">{{ obj.count }}</span>
          </div>
        </li>
      </ul>
    </div>

    <!-- ── TAB: KUNDEN ────────────────────────────────────── -->
    <div v-else class="vm-tab-content">
      <div class="vm-form">
        <input v-model="customerName" type="text" placeholder="Name" class="vm-input" />
        <input v-model="customerEmail" type="email" placeholder="E-Mail" class="vm-input" />
        <input v-model="customerPhone" type="text" placeholder="Telefon" class="vm-input vm-input-sm" />
        <input v-model="customerProperty" type="text" placeholder="Objekt" class="vm-input vm-input-sm" />
        <input v-model="customerNotes" type="text" placeholder="Notiz (optional)" class="vm-input" />
        <button @click="submitCustomer" class="vm-btn-add" :disabled="!customerName.trim()">+</button>
      </div>

      <div v-if="customerFormError || customersStore.errorMessage" class="vm-summary-row">
        <span class="text-xs text-red-700">{{ customerFormError || customersStore.errorMessage }}</span>
      </div>

      <div class="vm-summary-row">
        <span class="text-xs text-slate-500">{{ customersStore.customerCount }} Kunden lokal gespeichert</span>
        <div class="vm-inline-actions">
          <button
            type="button"
            class="vm-install-btn"
            :disabled="isResettingCustomers"
            @click="resetDemoCustomers"
          >
            {{ isResettingCustomers ? 'Erstelle neu...' : 'Demo-Daten neu erstellen' }}
          </button>
          <button
            type="button"
            class="vm-install-btn"
            :disabled="!customerSyncConfigured || isSyncingCustomers || customersStore.pendingSyncCount === 0"
            @click="syncCustomers"
          >
            {{ isSyncingCustomers ? 'Synchronisiere...' : 'Jetzt synchronisieren' }}
          </button>
        </div>
      </div>

      <div v-if="!customerSyncConfigured" class="vm-summary-row">
        <span class="text-xs text-slate-500">
          Sync ist deaktiviert. Setze VITE_CUSTOMERS_SYNC_ENDPOINT, um Backend-Sync zu aktivieren.
        </span>
      </div>

      <div v-if="customersStore.pendingSyncCount > 0" class="vm-summary-row">
        <span class="text-xs text-amber-700">{{ customersStore.pendingSyncCount }} Änderungen warten auf Sync</span>
      </div>

      <ul class="vm-list">
        <li v-if="customersStore.isLoading" class="vm-empty">Kunden werden geladen...</li>
        <li v-else-if="customersStore.customers.length === 0" class="vm-empty">Noch keine Kunden erfasst.</li>
        <li v-for="customer in customersStore.customers" :key="customer.id" class="vm-item">
          <div class="vm-item-main">
            <span class="text-xs font-semibold text-slate-800">{{ customer.name }}</span>
            <span v-if="customer.propertyLabel" class="text-xs text-slate-500">Objekt: {{ customer.propertyLabel }}</span>
            <span v-if="customer.email" class="text-xs text-slate-500">{{ customer.email }}</span>
            <span v-if="customer.phone" class="text-xs text-slate-500">{{ customer.phone }}</span>
            <span v-if="customer.notes" class="text-xs text-slate-400">{{ customer.notes }}</span>
          </div>
          <div class="vm-item-actions">
            <span class="text-xs text-slate-400">{{ formatDate(customer.updatedAt) }}</span>
            <button @click="removeCustomer(customer.id)" class="vm-btn-small vm-btn-red">✕</button>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>
