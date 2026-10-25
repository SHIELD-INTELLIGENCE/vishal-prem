import { doc, runTransaction, setDoc, updateDoc } from 'firebase/firestore'
import { deleteObject, ref } from 'firebase/storage'
import { hasPermission } from '@/auth/permissions'
import { db, storage } from '@/lib/firebase'
import { friendlyFirebaseError } from '@/lib/errors'
import { nowIso, uniqueId } from '@/lib/utils'
import type { Product, UserProfile } from '@/types/models'
import type { ProductValues } from '@/lib/validation'

export interface ProductImageValue {
  url: string
  path: string
}

type ProductInventoryFields = Pick<
  Product,
  'trackStock' | 'openingStock' | 'stockQty' | 'criticalStock' | 'conversionFactor'
>

function buildProductPayload({
  id,
  values,
  image,
  profile,
  now,
  createdAt,
  createdBy,
  stock,
}: {
  id: string
  values: ProductValues
  image: ProductImageValue | null
  profile: UserProfile
  now: string
  createdAt: string
  createdBy: string
  stock: ProductInventoryFields
}): Product {
  return {
    id,
    name: values.name.trim(),
    alias: values.alias?.trim() || '',
    sku: values.sku?.trim() || '',
    printName: values.printName.trim(),
    group: values.group.trim(),
    category: values.category.trim(),
    departmentId: values.departmentId,
    outletIds: values.outletIds,
    pricingMode: values.pricingMode,
    unit: values.unit.trim(),
    altUnit: values.altUnit?.trim() || '',
    ...(stock.conversionFactor !== undefined
      ? { conversionFactor: stock.conversionFactor }
      : {}),
    packagingUnit: values.packagingUnit?.trim() || '',
    boxQuantity: values.boxQuantity,
    cakeSizes: values.cakeSizes?.map((size) => ({
      label: size.label.trim(),
      pounds: size.pounds,
      pricePaise: Math.round(size.price * 100),
    })),
    salePricePaise: Math.round(values.salePrice * 100),
    purchasePricePaise:
      values.purchasePrice !== undefined ? Math.round(values.purchasePrice * 100) : undefined,
    mrpPaise: values.mrp !== undefined ? Math.round(values.mrp * 100) : undefined,
    minSalePricePaise:
      values.minSalePrice !== undefined ? Math.round(values.minSalePrice * 100) : undefined,
    discountPercent: values.discountPercent,
    taxPercent: values.taxPercent,
    taxCategory: values.taxCategory?.trim() || '',
    hsn: values.hsn?.trim().toUpperCase() || '',
    trackStock: stock.trackStock,
    ...(stock.openingStock !== undefined ? { openingStock: stock.openingStock } : {}),
    ...(stock.stockQty !== undefined ? { stockQty: stock.stockQty } : {}),
    ...(stock.criticalStock !== undefined ? { criticalStock: stock.criticalStock } : {}),
    batchTracking: values.batchTracking,
    expiryTracking: values.expiryTracking,
    description: values.description?.trim() || '',
    imageUrl: image?.url ?? '',
    imagePath: image?.path ?? '',
    active: values.active,
    available: values.available,
    createdAt,
    updatedAt: now,
    createdBy,
    updatedBy: profile.uid,
  }
}

/**
 * Resolves inventory fields for a metadata edit.
 *
 * Balance, opening balance, tracking and conversion are owned by the stock
 * adjustment path and creation workflow. A product edit preserves the values
 * currently in Firestore so a stale form or concurrent order deduction cannot
 * overwrite the counter. Critical level is ordinary metadata and may change.
 */
function resolveEditInventoryFields({
  values,
  live,
}: {
  values: ProductValues
  live: Product
}): ProductInventoryFields {
  return {
    trackStock: live.trackStock,
    openingStock: live.openingStock,
    stockQty: live.stockQty,
    criticalStock: live.trackStock ? values.criticalStock : live.criticalStock,
    conversionFactor: live.conversionFactor,
  }
}

export async function saveProduct({
  values,
  existing,
  image,
  profile,
}: {
  values: ProductValues
  existing?: Product | null
  image: ProductImageValue | null
  profile: UserProfile
}): Promise<string> {
  if (!db) throw new Error('Firestore is not available.')
  const database = db
  const now = nowIso()
  const id = existing?.id ?? uniqueId()

  try {
    if (existing) {
      await runTransaction(database, async (transaction) => {
        const productRef = doc(database, 'products', id)
        const snapshot = await transaction.get(productRef)
        if (!snapshot.exists()) {
          throw new Error('This product no longer exists. Refresh and try again.')
        }

        const live = { ...(snapshot.data() as Product), id: snapshot.id }
        const payload = buildProductPayload({
          id,
          values,
          image,
          profile,
          now,
          createdAt: live.createdAt || existing.createdAt || now,
          createdBy: live.createdBy || existing.createdBy || profile.uid,
          stock: resolveEditInventoryFields({ values, live }),
        })
        transaction.set(productRef, payload)
      })
    } else {
      const canSetInitialStock = hasPermission(profile, 'inventoryAdjust')
      if (values.trackStock && !canSetInitialStock) {
        throw new Error(
          'Only staff with the Adjust stock permission can create a stock-tracked product.',
        )
      }

      const trackStock = canSetInitialStock && values.trackStock
      const initialStock = trackStock
        ? (values.openingStock ?? values.stockQty ?? 0)
        : undefined
      const payload = buildProductPayload({
        id,
        values,
        image,
        profile,
        now,
        createdAt: now,
        createdBy: profile.uid,
        stock: {
          trackStock,
          conversionFactor: values.conversionFactor,
          openingStock: initialStock,
          stockQty: initialStock,
          criticalStock: trackStock ? values.criticalStock : undefined,
        },
      })
      await setDoc(doc(database, 'products', id), payload)
    }
  } catch (error) {
    throw new Error(friendlyFirebaseError(error))
  }
  return id
}

/**
 * Deletes a product image object after the product document no longer
 * references it. Callers must wait for the product save to succeed first.
 */
export async function deleteProductImage(path: string): Promise<void> {
  if (!storage || !path) return
  await deleteObject(ref(storage, path))
}

export async function updateProductFlags(
  productId: string,
  patch: { active?: boolean; available?: boolean },
  profile: UserProfile,
): Promise<void> {
  if (!db) throw new Error('Firestore is not available.')
  try {
    await updateDoc(doc(db, 'products', productId), {
      ...patch,
      updatedAt: nowIso(),
      updatedBy: profile.uid,
    })
  } catch (error) {
    throw new Error(friendlyFirebaseError(error))
  }
}

export async function setProductsActive(
  products: Product[],
  active: boolean,
  profile: UserProfile,
): Promise<void> {
  if (!db) throw new Error('Firestore is not available.')
  const database = db
  const now = nowIso()
  await Promise.all(
    products.map((product) =>
      setDoc(
        doc(database, 'products', product.id),
        { active, updatedAt: now, updatedBy: profile.uid },
        { merge: true },
      ),
    ),
  )
}
