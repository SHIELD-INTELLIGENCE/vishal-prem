import { callTrustedOperation } from '@/lib/functions'

export interface DirectoryEntry {
  uid: string
  displayName: string
  role: string
  departmentIds: string[]
}

export async function loadStaffDirectory(outletId: string, departmentId?: string): Promise<DirectoryEntry[]> {
  return callTrustedOperation<{ outletId: string; departmentId?: string }, DirectoryEntry[]>(
    'staffDirectory',
    { outletId, departmentId },
  )
}
