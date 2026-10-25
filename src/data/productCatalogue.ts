/**
 * Shared product catalogue loader.
 *
 * Product selectors previously used fixed 500-row queries and then filtered
 * client-side, which silently hid products once a catalogue grew. This hook
 * keeps the existing realtime query architecture but grows the loaded window
 * explicitly, exposes `hasMore`, and never pretends a truncated list is
 * complete.
 */

import { useMemo, useState } from 'react'
import type { Product, UserProfile } from '@/types/models'
import { useCollectionData, type LiveCollectionState } from './hooks'
import { productsQuery } from './queries'

export const PRODUCT_PAGE_SIZE = 300
export const PRODUCT_MAX_LOADED = 3000

export interface ProductCatalogueState extends LiveCollectionState<Product> {
  /** More matching documents may exist beyond the loaded window. */
  hasMore: boolean
  loaded: number
  loadedLimit: number
  maxLoaded: number
  loadMore: () => void
}

export function useProductCatalogue(
  profile: UserProfile | null | undefined,
  outletId: string | null | undefined,
  enabled = true,
): ProductCatalogueState {
  const [pages, setPages] = useState(1)
  const loadedLimit = Math.min(PRODUCT_MAX_LOADED, PRODUCT_PAGE_SIZE * pages)
  const state = useCollectionData<Product>(
    () => (profile && outletId ? productsQuery(outletId, profile, loadedLimit) : null),
    [
      profile?.uid,
      outletId,
      profile?.role,
      profile?.departmentIds.join(','),
      loadedLimit,
    ],
    Boolean(enabled && profile && outletId),
  )

  const hasMore = state.rows.length >= loadedLimit && loadedLimit < PRODUCT_MAX_LOADED

  return useMemo(
    () => ({
      ...state,
      hasMore,
      loaded: state.rows.length,
      loadedLimit,
      maxLoaded: PRODUCT_MAX_LOADED,
      loadMore: () => setPages((value) => value + 1),
    }),
    [state, hasMore, loadedLimit],
  )
}
