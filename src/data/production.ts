import { callTrustedOperation } from '@/lib/functions'
import type { ProductionTask } from '@/types/models'

async function run<T>(body: Record<string, unknown>): Promise<T> {
  return callTrustedOperation<Record<string, unknown>, T>('productionOperation', body)
}

export async function syncProduction(outletId: string) {
  return run<{ created: number; updated: number; total: number }>({ action: 'sync', outletId })
}

export async function assignProductionTask(taskId: string, assignedTo: string) {
  return run<ProductionTask>({ action: 'assign', taskId, assignedTo })
}

export async function startProductionTask(taskId: string) {
  return run<ProductionTask>({ action: 'start', taskId })
}

export async function recordProductionProgress(
  taskId: string,
  completedDelta: number,
  options: { rejectedDelta?: number; reworkDelta?: number; note?: string } = {},
) {
  return run<ProductionTask>({
    action: 'progress',
    taskId,
    completedDelta,
    rejectedDelta: options.rejectedDelta,
    reworkDelta: options.reworkDelta,
    note: options.note,
  })
}

export async function recordProductionQuality(
  taskId: string,
  qualityStatus: 'pending' | 'passed' | 'rejected' | 'rework',
  note?: string,
) {
  return run<ProductionTask>({ action: 'quality', taskId, qualityStatus, note })
}

export async function cancelProductionTask(taskId: string, reason: string) {
  return run<ProductionTask>({ action: 'cancel', taskId, reason })
}
