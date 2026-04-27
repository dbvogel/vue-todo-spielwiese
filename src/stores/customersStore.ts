import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { customerRepository } from '@/repositories/customerRepository'
import type { Customer, UpsertCustomerInput } from '@/types/customer'

const GERMAN_DEMO_CUSTOMERS: UpsertCustomerInput[] = [
  { name: 'Anna Mueller', email: 'anna.mueller@example.de', phone: '0151 1001 2001', propertyLabel: 'Hauptstrasse 12, WE 1', notes: 'SEPA aktiv' },
  { name: 'Lukas Schneider', email: 'lukas.schneider@example.de', phone: '0151 1001 2002', propertyLabel: 'Hauptstrasse 12, WE 2', notes: 'Zahlt puenktlich' },
  { name: 'Sophie Fischer', email: 'sophie.fischer@example.de', phone: '0151 1001 2003', propertyLabel: 'Hauptstrasse 12, WE 3', notes: 'Nebenkosten geprueft' },
  { name: 'Maximilian Weber', email: 'max.weber@example.de', phone: '0151 1001 2004', propertyLabel: 'Lindenweg 8, EG links', notes: '' },
  { name: 'Lea Wagner', email: 'lea.wagner@example.de', phone: '0151 1001 2005', propertyLabel: 'Lindenweg 8, EG rechts', notes: '' },
  { name: 'Noah Becker', email: 'noah.becker@example.de', phone: '0151 1001 2006', propertyLabel: 'Lindenweg 8, 1. OG', notes: 'Haustier angemeldet' },
  { name: 'Marie Hoffmann', email: 'marie.hoffmann@example.de', phone: '0151 1001 2007', propertyLabel: 'Bahnhofstrasse 3, App. A', notes: '' },
  { name: 'Paul Schaefer', email: 'paul.schaefer@example.de', phone: '0151 1001 2008', propertyLabel: 'Bahnhofstrasse 3, App. B', notes: '' },
  { name: 'Emilia Koch', email: 'emilia.koch@example.de', phone: '0151 1001 2009', propertyLabel: 'Bahnhofstrasse 3, App. C', notes: 'Staffelmiete ab 2027' },
  { name: 'Felix Bauer', email: 'felix.bauer@example.de', phone: '0151 1001 2010', propertyLabel: 'Am Park 21, Haus 1', notes: '' },
  { name: 'Mia Richter', email: 'mia.richter@example.de', phone: '0151 1001 2011', propertyLabel: 'Am Park 21, Haus 2', notes: '' },
  { name: 'Jonas Klein', email: 'jonas.klein@example.de', phone: '0151 1001 2012', propertyLabel: 'Am Park 21, Haus 3', notes: 'Nachzahlung offen' },
  { name: 'Clara Wolf', email: 'clara.wolf@example.de', phone: '0151 1001 2013', propertyLabel: 'Rosenallee 5, DG links', notes: '' },
  { name: 'Ben Neumann', email: 'ben.neumann@example.de', phone: '0151 1001 2014', propertyLabel: 'Rosenallee 5, DG rechts', notes: '' },
  { name: 'Johanna Krause', email: 'johanna.krause@example.de', phone: '0151 1001 2015', propertyLabel: 'Schulweg 19, EG', notes: '' },
  { name: 'Leon Zimmermann', email: 'leon.zimmermann@example.de', phone: '0151 1001 2016', propertyLabel: 'Schulweg 19, 1. OG', notes: 'Ratenzahlung fuer NK' },
]

export const useCustomersStore = defineStore('customers', () => {
  const customers = ref<Customer[]>([])
  const pendingSyncCount = ref(0)
  const isLoading = ref(false)
  const errorMessage = ref<string | null>(null)

  const customerCount = computed(() => customers.value.length)

  async function upsertGermanDemoCustomers() {
    for (const customer of GERMAN_DEMO_CUSTOMERS) {
      await customerRepository.upsertCustomer(customer)
    }
  }

  async function refreshPendingSyncCount() {
    const jobs = await customerRepository.getPendingSyncJobs()
    pendingSyncCount.value = jobs.length
  }

  async function loadCustomers() {
    isLoading.value = true
    errorMessage.value = null

    try {
      customers.value = await customerRepository.listCustomers()
      await refreshPendingSyncCount()
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Kundendaten konnten nicht geladen werden.'
    } finally {
      isLoading.value = false
    }
  }

  async function saveCustomer(input: UpsertCustomerInput) {
    if (!input.name.trim()) {
      throw new Error('Name ist erforderlich.')
    }

    errorMessage.value = null

    try {
      await customerRepository.upsertCustomer(input)
      customers.value = await customerRepository.listCustomers()
      await refreshPendingSyncCount()
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Kunde konnte nicht gespeichert werden.'
      throw error
    }
  }

  async function removeCustomer(id: string) {
    errorMessage.value = null

    try {
      await customerRepository.deleteCustomer(id)
      customers.value = await customerRepository.listCustomers()
      await refreshPendingSyncCount()
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Kunde konnte nicht gelöscht werden.'
      throw error
    }
  }

  async function seedGermanDemoCustomers() {
    if (customers.value.length > 0) {
      return 0
    }

    errorMessage.value = null

    try {
      await upsertGermanDemoCustomers()

      customers.value = await customerRepository.listCustomers()
      await refreshPendingSyncCount()
      return GERMAN_DEMO_CUSTOMERS.length
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Demo-Kunden konnten nicht erstellt werden.'
      throw error
    }
  }

  async function resetAndSeedGermanDemoCustomers() {
    errorMessage.value = null

    try {
      try {
        await customerRepository.clearCustomerDataForTesting()
      } catch {
        // Some browser contexts can temporarily block IndexedDB clear operations.
        // Fall back to idempotent upserts so demo data still appears.
      }

      await upsertGermanDemoCustomers()

      customers.value = await customerRepository.listCustomers()
      await refreshPendingSyncCount()
      return GERMAN_DEMO_CUSTOMERS.length
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : 'Demo-Kunden konnten nicht neu erstellt werden.'
      throw error
    }
  }

  return {
    customers,
    pendingSyncCount,
    isLoading,
    errorMessage,
    customerCount,
    loadCustomers,
    saveCustomer,
    removeCustomer,
    seedGermanDemoCustomers,
    resetAndSeedGermanDemoCustomers,
    refreshPendingSyncCount,
  }
})