import { useEffect, useRef, useState } from 'react'
import {
  doc,
  onSnapshot,
  type DocumentReference,
  type Query,
  type QuerySnapshot,
  type DocumentSnapshot,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { friendlyFirebaseError } from '@/lib/errors'

export interface LiveCollectionState<T> {
  rows: T[]
  loading: boolean
  error: string | null
  fromCache: boolean
  reload: () => void
}

function toRows<T>(snapshot: QuerySnapshot): T[] {
  return snapshot.docs.map((item) => ({ ...(item.data() as T), id: item.id }))
}

/**
 * Subscribes to a Firestore query. `deps` must contain every value used by
 * `buildQuery`; the query is rebuilt when they change.
 */
export function useCollectionData<T>(
  buildQuery: () => Query | null,
  deps: unknown[],
  enabled = true,
): LiveCollectionState<T> {
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [fromCache, setFromCache] = useState(false)
  const [nonce, setNonce] = useState(0)
  const buildRef = useRef(buildQuery)
  buildRef.current = buildQuery

  useEffect(() => {
    if (!enabled) {
      setRows([])
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setError(null)

    let target: Query | null = null
    try {
      target = buildRef.current()
    } catch (buildError) {
      setError(friendlyFirebaseError(buildError))
      setLoading(false)
      return
    }

    if (!target) {
      setRows([])
      setLoading(false)
      return
    }

    const unsubscribe = onSnapshot(
      target,
      (snapshot) => {
        if (!active) return
        setRows(toRows<T>(snapshot))
        setFromCache(snapshot.metadata.fromCache)
        setLoading(false)
        setError(null)
      },
      (snapshotError) => {
        if (!active) return
        setError(friendlyFirebaseError(snapshotError))
        setLoading(false)
      },
    )

    return () => {
      active = false
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, nonce, ...deps])

  return {
    rows,
    loading,
    error,
    fromCache,
    reload: () => setNonce((value) => value + 1),
  }
}

export function useDocumentData<T>(
  path: string | null,
  deps: unknown[] = [],
  enabled = true,
): {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
} {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(Boolean(path && enabled))
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!path || !enabled || !db) {
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    const reference = doc(db, path) as DocumentReference
    const unsubscribe = onSnapshot(
      reference,
      (snapshot: DocumentSnapshot) => {
        if (!active) return
        setData(snapshot.exists() ? ({ ...(snapshot.data() as T), id: snapshot.id } as T) : null)
        setLoading(false)
        setError(null)
      },
      (snapshotError) => {
        if (!active) return
        setError(friendlyFirebaseError(snapshotError))
        setLoading(false)
      },
    )
    return () => {
      active = false
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, enabled, nonce, ...deps])

  return { data, loading, error, reload: () => setNonce((value) => value + 1) }
}
