import Dexie, { type EntityTable } from 'dexie'
import type { Customer, CustomerSyncJob } from '@/types/customer'

export interface CustomerRow extends Customer {
  deletedAt: string | null
}

class VermieterAppDb extends Dexie {
  customers!: EntityTable<CustomerRow, 'id'>
  customerSyncQueue!: EntityTable<CustomerSyncJob, 'id'>

  constructor() {
    super('vermieter-pwa-db')

    this.version(1).stores({
      customers: 'id, name, email, propertyLabel, updatedAt, deletedAt',
      customerSyncQueue: 'id, customerId, action, createdAt, attempts',
    })
  }
}

export const appDb = new VermieterAppDb()