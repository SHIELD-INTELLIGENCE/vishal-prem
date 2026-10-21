import { doc, setDoc, writeBatch } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { nowIso, uniqueId } from '@/lib/utils'
import type { Business, Department, Outlet, UserProfile } from '@/types/models'
import type { BusinessSettingsValues, SetupValues } from '@/lib/validation'

export async function setupWorkspace(values: SetupValues, profile: UserProfile): Promise<void> {
  if (!db) throw new Error('Firestore is not available.')
  if (profile.role !== 'super_admin') throw new Error('Only a Super Admin can set up the workspace.')
  const now = nowIso()
  const batch = writeBatch(db)
  const outletOneId = uniqueId()
  const outletTwoId = uniqueId()

  const business: Business = {
    id: 'main',
    name: values.businessName,
    legalName: values.legalName,
    tagline: 'Bakery & Sweets',
    phone: values.phone,
    email: values.email ?? '',
    addressLine1: values.addressLine1,
    city: values.city,
    state: values.state,
    pin: values.pin,
    pricesIncludeTax: false,
    defaultTaxPercent: 5,
    invoicePrefix: 'VP',
    printer: { receiptWidth: '80mm', kitchenWidth: '80mm', packingSlipSize: 'a5' },
    busy: { status: 'not_connected', notes: '' },
    updatedAt: now,
  }

  const outletOne: Outlet = {
    id: outletOneId,
    code: values.outletOneCode.toUpperCase(),
    name: values.outletOneName,
    address: values.addressLine1,
    phone: values.phone,
    active: true,
    createdAt: now,
    updatedAt: now,
    createdBy: profile.uid,
  }
  const outletTwo: Outlet = {
    ...outletOne,
    id: outletTwoId,
    code: values.outletTwoCode.toUpperCase(),
    name: values.outletTwoName,
  }

  const departments: Array<Pick<Department, 'code' | 'name' | 'color' | 'description'>> = [
    { code: 'cake', name: 'Cake', color: '#C8102E', description: 'Cakes, pastries and celebration desserts.' },
    { code: 'sweets', name: 'Sweets', color: '#C8922C', description: 'Mithai, barfi and festival sweets.' },
    { code: 'hot', name: 'Hot Section', color: '#B4532A', description: 'Patties, samosas, puffs and hot snacks.' },
    { code: 'gajak', name: 'Gajak', color: '#7A5C2E', description: 'Gajak, rewari and sesame specialties.' },
  ]

  batch.set(doc(db, 'business', 'main'), business)
  batch.set(doc(db, 'outlets', outletOne.id), outletOne)
  batch.set(doc(db, 'outlets', outletTwo.id), outletTwo)
  for (const dept of departments) {
    const id = uniqueId()
    batch.set(doc(db, 'departments', id), {
      ...dept,
      id,
      outletIds: [outletOne.id, outletTwo.id],
      active: true,
      createdAt: now,
      updatedAt: now,
      createdBy: profile.uid,
    })
  }
  await batch.commit()
}

export async function saveBusiness(
  values: BusinessSettingsValues,
  business: Business | null,
  profile: UserProfile,
): Promise<void> {
  if (!db) throw new Error('Firestore is not available.')
  const now = nowIso()
  await setDoc(
    doc(db, 'business', 'main'),
    {
      ...(business ?? {}),
      id: 'main',
      ...values,
      email: values.email ?? '',
      tagline: values.tagline ?? '',
      addressLine2: values.addressLine2 ?? '',
      gstin: values.gstin ?? '',
      upiId: values.upiId ?? '',
      receiptFooter: values.receiptFooter ?? '',
      printer: business?.printer ?? {
        receiptWidth: '80mm',
        kitchenWidth: '80mm',
        packingSlipSize: 'a5',
      },
      busy: business?.busy ?? { status: 'not_connected', notes: '' },
      updatedAt: now,
      updatedBy: profile.uid,
    },
    { merge: true },
  )
}
