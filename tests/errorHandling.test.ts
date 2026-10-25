import { describe, expect, it } from 'vitest'
import { FirebaseError } from 'firebase/app'
import { classifyFirebaseError } from '../functions/src/backend/firebaseErrorMapping'
import {
  describeFirebaseError,
  friendlyFirebaseError,
} from '@/lib/errors'
import { FirebaseUnavailableError } from '@/lib/firebase'
import { TrustedFunctionError } from '@/lib/functions'

describe('classifyFirebaseError', () => {
  it('classifies a missing composite index and keeps the console URL as a diagnostic', () => {
    const url = 'https://console.firebase.google.com/project/demo/firestore/indexes?create_composite=abc'
    const result = classifyFirebaseError({
      code: 9,
      message: `The query requires an index. You can create it here: ${url}`,
    })

    expect(result).toMatchObject({
      code: 'failed-precondition',
      diagnostic: { source: 'firebase', code: '9', indexUrl: url },
    })
    expect(result?.message).toMatch(/index/i)
  })

  it('does not label every failed-precondition as an index problem', () => {
    const result = classifyFirebaseError({
      code: 'firestore/failed-precondition',
      message: 'A required document is missing.',
    })

    expect(result).toMatchObject({ code: 'failed-precondition' })
    expect(result?.message).not.toMatch(/index/i)
  })

  it('maps permission, availability and quota failures to distinct codes', () => {
    expect(classifyFirebaseError({ code: 'firestore/permission-denied' })?.code)
      .toBe('permission-denied')
    expect(classifyFirebaseError({ code: 14 })?.code).toBe('unavailable')
    expect(classifyFirebaseError({ code: 8 })?.code).toBe('resource-exhausted')
    expect(classifyFirebaseError({ code: 5 })?.code).toBe('not-found')
  })

  it('ignores ordinary application errors', () => {
    expect(classifyFirebaseError(new Error('business rule'))).toBeNull()
  })
})

describe('friendlyFirebaseError', () => {
  it('identifies an index failure without pretending every failure is an index', () => {
    const indexError = new FirebaseError(
      'firestore/failed-precondition',
      'The query requires an index. You can create it here: https://console.firebase.google.com/project/demo/firestore/indexes?create_composite=abc',
    )
    expect(friendlyFirebaseError(indexError)).toMatch(/Firestore index/i)

    const stateError = new FirebaseError(
      'firestore/failed-precondition',
      'The stored data is not in the required state.',
    )
    expect(friendlyFirebaseError(stateError)).toMatch(/not in the required state/i)
    expect(friendlyFirebaseError(stateError)).not.toMatch(/one-time Firestore index/i)
  })

  it('distinguishes permission and connectivity failures', () => {
    expect(friendlyFirebaseError(new FirebaseError('firestore/permission-denied', 'denied')))
      .toMatch(/permission/i)
    expect(friendlyFirebaseError(new FirebaseError('firestore/unavailable', 'offline')))
      .toMatch(/unreachable|connection/i)
  })

  it('reports missing Firebase configuration instead of an index problem', () => {
    expect(friendlyFirebaseError(new FirebaseUnavailableError()))
      .toMatch(/Firebase is not configured/i)
  })

  it('turns a missing local function endpoint into an actionable Netlify Dev message', () => {
    const message = friendlyFirebaseError(
      new TrustedFunctionError(
        'endpoint-not-found',
        'The trusted service endpoint was not found. If you are running locally, start the app with Netlify Dev (`npm run dev:netlify`).',
        404,
      ),
    )
    expect(message).toMatch(/Netlify Dev/i)
    expect(message).not.toMatch(/database is missing a one-time setup step/i)
  })

  it('preserves a trusted domain message and adds an internal support reference', () => {
    expect(friendlyFirebaseError(
      new TrustedFunctionError(
        'failed-precondition',
        'Stock is not tracked for "Kaju Barfi".',
        412,
      ),
    )).toMatch(/Stock is not tracked/)

    const internal = friendlyFirebaseError(
      new TrustedFunctionError(
        'internal',
        'The request could not be completed.',
        500,
        { reference: 'ERR-ABC12345' },
      ),
    )
    expect(internal).toMatch(/Reference: ERR-ABC12345/)
  })

  it('normalizes auth error codes so the correct message is selected', () => {
    expect(friendlyFirebaseError(new FirebaseError('auth/wrong-password', 'bad password')))
      .toMatch(/email or password/i)
  })

  it('exposes the index URL only as a developer diagnostic', () => {
    const details = describeFirebaseError(new FirebaseError(
      'firestore/failed-precondition',
      'The query requires an index. Create it here: https://console.firebase.google.com/project/demo/firestore/indexes?create_composite=abc',
    ))
    expect(details.isIndexError).toBe(true)
    expect(details.indexUrl).toContain('console.firebase.google.com')
  })
})
