import { customerRepository } from '@/repositories/customerRepository'

const CUSTOMERS_SYNC_ENDPOINT = import.meta.env.VITE_CUSTOMERS_SYNC_ENDPOINT?.trim() ?? ''

interface SyncApiResponse {
  ok?: boolean
  error?: string
}

function isOnline(): boolean {
  if (typeof navigator === 'undefined') {
    return true
  }

  return navigator.onLine
}

function hasConfiguredSyncEndpoint(): boolean {
  return CUSTOMERS_SYNC_ENDPOINT.length > 0
}

export function isCustomerSyncConfigured(): boolean {
  return hasConfiguredSyncEndpoint()
}

export async function flushCustomerSyncQueue(limit = 50) {
  if (!isOnline()) {
    return { processed: 0, succeeded: 0, failed: 0, skipped: true, reason: 'offline' as const }
  }

  if (!hasConfiguredSyncEndpoint()) {
    return { processed: 0, succeeded: 0, failed: 0, skipped: true, reason: 'no-endpoint' as const }
  }

  const jobs = await customerRepository.getPendingSyncJobs(limit)
  let succeeded = 0
  let failed = 0

  for (const job of jobs) {
    try {
      const response = await fetch(CUSTOMERS_SYNC_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: job.id,
          customerId: job.customerId,
          action: job.action,
          payload: job.payload,
          createdAt: job.createdAt,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        failed += 1
        await customerRepository.markSyncJobFailed(
          job.id,
          errorText || `Sync failed with status ${response.status}`,
        )
        continue
      }

      let responseData: SyncApiResponse | null = null
      try {
        responseData = (await response.json()) as SyncApiResponse
      } catch {
        responseData = { ok: true }
      }

      if (responseData?.ok === false) {
        failed += 1
        await customerRepository.markSyncJobFailed(
          job.id,
          responseData.error || 'Sync endpoint returned an error.',
        )
        continue
      }

      succeeded += 1
      await customerRepository.markSyncJobsSuccessful([job.id])
    } catch (error) {
      failed += 1
      await customerRepository.markSyncJobFailed(
        job.id,
        error instanceof Error ? error.message : 'Network error while syncing customer.',
      )
    }
  }

  return {
    processed: jobs.length,
    succeeded,
    failed,
    skipped: false,
    reason: null,
  }
}