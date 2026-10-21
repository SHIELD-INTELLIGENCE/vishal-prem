import { callTrustedOperation } from '@/lib/functions'
import type { DeliveryStatus } from '@/types/models'

async function run<T>(body: Record<string, unknown>): Promise<T> {
  return callTrustedOperation<Record<string, unknown>, T>('deliveryOperation', body)
}

export async function createDelivery(sourceType: 'order' | 'booking', sourceId: string) {
  return run<{ deliveryId: string; status: DeliveryStatus }>({ action: 'create', sourceType, sourceId })
}

export async function assignDelivery(deliveryId: string, assignedTo: string) {
  return run<{ deliveryId: string; status: DeliveryStatus }>({ action: 'assign', deliveryId, assignedTo })
}

export async function dispatchDelivery(deliveryId: string) {
  return run<{ deliveryId: string; status: DeliveryStatus }>({ action: 'dispatch', deliveryId })
}

export async function completeDelivery(
  deliveryId: string,
  status: 'delivered' | 'partially_delivered' | 'failed' | 'returned',
  lines: Array<{ lineId: string; deliveredQty: number; returnedQty: number; damagedQty: number }>,
  note?: string,
) {
  return run<{ deliveryId: string; status: DeliveryStatus }>({ action: 'complete', deliveryId, status, lines, note })
}

export async function collectDeliveryPayment(
  deliveryId: string,
  input: {
    requestId: string
    amountPaise: number
    mode: 'cash' | 'upi' | 'card' | 'bank_transfer' | 'other'
    reference?: string
    notes?: string
  },
) {
  return run<{ deliveryId: string; paymentId: string; receiptNumber: string; status: DeliveryStatus }>({
    action: 'collect',
    deliveryId,
    ...input,
  })
}
