import { appDb, type CustomerRow } from '@/db/appDb'
import type {
  Customer,
  CustomerSyncAction,
  CustomerSyncJob,
  UpsertCustomerInput,
} from '@/types/customer'

function nowIso(): string {
  return new Date().toISOString()
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function toCustomer(row: CustomerRow): Customer {
  const { deletedAt: _deletedAt, ...customer } = row
  return customer
}

async function enqueueMutation(
  action: CustomerSyncAction,
  customerId: string,
  payload: Customer | Pick<Customer, 'id'>,
) {
  const job: CustomerSyncJob = {
    id: generateId(),
    customerId,
    action,
    payload,
    createdAt: nowIso(),
    attempts: 0,
    lastError: null,
  }

  await appDb.customerSyncQueue.add(job)
}

export class CustomerRepository {
  async listCustomers(): Promise<Customer[]> {
    const rows = await appDb.customers.orderBy('updatedAt').reverse().toArray()

    return rows.filter(row => row.deletedAt === null).map(toCustomer)
  }

  async getCustomerById(id: string): Promise<Customer | null> {
    const row = await appDb.customers.get(id)

    if (!row || row.deletedAt !== null) {
      return null
    }

    return toCustomer(row)
  }

  async upsertCustomer(input: UpsertCustomerInput): Promise<Customer> {
    const existing = input.id ? await appDb.customers.get(input.id) : undefined
    const currentTime = nowIso()

    const customerRow: CustomerRow = {
      id: input.id ?? generateId(),
      name: input.name.trim(),
      email: input.email?.trim() ?? '',
      phone: input.phone?.trim() ?? '',
      propertyLabel: input.propertyLabel?.trim() ?? '',
      notes: input.notes?.trim() ?? '',
      createdAt: existing?.createdAt ?? currentTime,
      updatedAt: currentTime,
      deletedAt: null,
    }

    await appDb.transaction('rw', appDb.customers, appDb.customerSyncQueue, async () => {
      await appDb.customers.put(customerRow)
      await enqueueMutation('upsert', customerRow.id, toCustomer(customerRow))
    })

    return toCustomer(customerRow)
  }

  async deleteCustomer(id: string): Promise<boolean> {
    const existing = await appDb.customers.get(id)

    if (!existing || existing.deletedAt !== null) {
      return false
    }

    const currentTime = nowIso()
    const deletedRow: CustomerRow = {
      ...existing,
      updatedAt: currentTime,
      deletedAt: currentTime,
    }

    await appDb.transaction('rw', appDb.customers, appDb.customerSyncQueue, async () => {
      await appDb.customers.put(deletedRow)
      await enqueueMutation('delete', id, { id })
    })

    return true
  }

  async getPendingSyncJobs(limit = 100): Promise<CustomerSyncJob[]> {
    return appDb.customerSyncQueue.orderBy('createdAt').limit(limit).toArray()
  }

  async markSyncJobsSuccessful(jobIds: string[]) {
    if (jobIds.length === 0) {
      return
    }

    await appDb.customerSyncQueue.bulkDelete(jobIds)
  }

  async markSyncJobFailed(jobId: string, errorMessage: string) {
    const existing = await appDb.customerSyncQueue.get(jobId)
    if (!existing) {
      return
    }

    await appDb.customerSyncQueue.update(jobId, {
      attempts: existing.attempts + 1,
      lastError: errorMessage,
    })
  }

  async clearCustomerDataForTesting() {
    await appDb.transaction('rw', appDb.customers, appDb.customerSyncQueue, async () => {
      await appDb.customers.clear()
      await appDb.customerSyncQueue.clear()
    })
  }
}

export const customerRepository = new CustomerRepository()