export interface Customer {
  id: string
  name: string
  email: string
  phone: string
  propertyLabel: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface UpsertCustomerInput {
  id?: string
  name: string
  email?: string
  phone?: string
  propertyLabel?: string
  notes?: string
}

export type CustomerSyncAction = 'upsert' | 'delete'

export interface CustomerSyncJob {
  id: string
  customerId: string
  action: CustomerSyncAction
  payload: Customer | Pick<Customer, 'id'>
  createdAt: string
  attempts: number
  lastError: string | null
}