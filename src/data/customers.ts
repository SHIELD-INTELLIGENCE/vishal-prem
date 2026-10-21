import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { friendlyFirebaseError } from '@/lib/errors'
import { nowIso, uniqueId } from '@/lib/utils'
import type { Customer, UserProfile } from '@/types/models'
import type { CustomerValues } from '@/lib/validation'

export async function saveCustomer({
  values,
  existing,
  profile,
}: {
  values: CustomerValues
  existing?: Customer | null
  profile: UserProfile
}): Promise<string> {
  if (!db) throw new Error('Firestore is not available.')
  const now = nowIso()
  const id = existing?.id ?? uniqueId()
  const payload: Customer = {
    id,
    name: values.name.trim(),
    alias: values.alias?.trim() || '',
    type: values.type,
    accountGroup: values.accountGroup,
    phone: values.phone ? values.phone.replace(/\D/g, '').slice(-10) : '',
    altPhone: values.altPhone?.trim() || '',
    email: values.email?.trim().toLowerCase() || '',
    addresses: values.addresses.map((address) => ({
      ...address,
      id: address.label,
      line2: address.line2?.trim() || '',
    })),
    state: values.state?.trim() || '',
    pin: values.pin?.trim() || '',
    gstin: values.gstin?.trim().toUpperCase() || '',
    pan: values.pan?.trim().toUpperCase() || '',
    openingBalancePaise: Math.round(values.openingBalance * 100),
    creditLimitPaise:
      values.creditLimit !== undefined ? Math.round(values.creditLimit * 100) : undefined,
    notes: values.notes?.trim() || '',
    outletIds: values.outletIds,
    active: values.active,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    createdBy: existing?.createdBy ?? profile.uid,
    updatedBy: profile.uid,
  }

  try {
    await setDoc(doc(db, 'customers', id), payload)
  } catch (error) {
    throw new Error(friendlyFirebaseError(error))
  }
  return id
}

export function customerBalanceLabel(openingBalancePaise: number): string {
  if (openingBalancePaise > 0) return 'Advance / credit'
  if (openingBalancePaise < 0) return 'Outstanding'
  return 'Settled'
}
