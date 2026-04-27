<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useVermieterStore } from '../stores/vermieterStore'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const store = useVermieterStore()

const deferredInstallPrompt = ref<BeforeInstallPromptEvent | null>(null)
const isInstalled = ref(false)
const isInstalling = ref(false)

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
  detectInstalledState()
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.addEventListener('appinstalled', onAppInstalled)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.removeEventListener('appinstalled', onAppInstalled)
})

// ── Tab state ─────────────────────────────────────────────────
type Tab = 'miete' | 'nebenkosten' | 'dokumente' | 'fristen'
const activeTab = ref<Tab>('miete')

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
</script>

<template>
  <section class="tile vermieter-tile reveal-in" style="animation-delay: 220ms;">
    <!-- Header -->
    <div class="vm-header">
      <div>
        <p class="eyebrow">Vermietung</p>
        <h2 class="section-title-compact" style="margin-bottom: 0;">Vermieter-Tool</h2>
      </div>
      <div class="vm-summary-pills">
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
        v-for="tab in (['miete', 'nebenkosten', 'dokumente', 'fristen'] as const)"
        :key="tab"
        @click="activeTab = tab"
        :class="['vm-tab', activeTab === tab ? 'vm-tab-active' : '']"
      >
        <span v-if="tab === 'miete'">🏠 Miete</span>
        <span v-else-if="tab === 'nebenkosten'">💧 NK</span>
        <span v-else-if="tab === 'dokumente'">📄 Docs</span>
        <span v-else>⏰ Fristen</span>
      </button>
    </div>

    <!-- ── TAB: MIETE ─────────────────────────────────────── -->
    <div v-if="activeTab === 'miete'" class="vm-tab-content">
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
    <div v-else class="vm-tab-content">
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
  </section>
</template>
