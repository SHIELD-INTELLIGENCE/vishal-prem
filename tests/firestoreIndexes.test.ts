import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface FirestoreIndex {
  collectionGroup: string
  queryScope: string
  fields: Array<{
    fieldPath: string
    order?: string
    arrayConfig?: string
  }>
}

interface FirestoreIndexFile {
  indexes: FirestoreIndex[]
}

const file = JSON.parse(
  readFileSync('firestore.indexes.json', 'utf8'),
) as FirestoreIndexFile

function hasIndex(
  collectionGroup: string,
  fields: Array<{ fieldPath: string; order?: string; arrayConfig?: string }>,
): boolean {
  return file.indexes.some((index) => (
    index.collectionGroup === collectionGroup
    && index.queryScope === 'COLLECTION'
    && index.fields.length === fields.length
    && index.fields.every((field, position) => (
      field.fieldPath === fields[position].fieldPath
      && field.order === fields[position].order
      && field.arrayConfig === fields[position].arrayConfig
    ))
  ))
}

describe('firestore.indexes.json', () => {
  it('covers the outlet-wide label event history query', () => {
    // src/data/labels.ts: labelEventsQuery for an outlet-wide role.
    expect(hasIndex('labelEvents', [
      { fieldPath: 'jobId', order: 'ASCENDING' },
      { fieldPath: 'outletId', order: 'ASCENDING' },
      { fieldPath: 'occurredAt', order: 'DESCENDING' },
    ])).toBe(true)
  })

  it('covers the department-scoped label event history query', () => {
    expect(hasIndex('labelEvents', [
      { fieldPath: 'jobId', order: 'ASCENDING' },
      { fieldPath: 'outletId', order: 'ASCENDING' },
      { fieldPath: 'departmentId', order: 'ASCENDING' },
      { fieldPath: 'occurredAt', order: 'DESCENDING' },
    ])).toBe(true)
  })

  it('covers the label job list for outlet-wide and department roles', () => {
    expect(hasIndex('labelPrintJobs', [
      { fieldPath: 'outletId', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ])).toBe(true)
    expect(hasIndex('labelPrintJobs', [
      { fieldPath: 'outletId', order: 'ASCENDING' },
      { fieldPath: 'departmentId', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ])).toBe(true)
  })

  it('covers the purchases and supplier-payment list queries', () => {
    expect(hasIndex('purchases', [
      { fieldPath: 'outletId', order: 'ASCENDING' },
      { fieldPath: 'receivedAt', order: 'DESCENDING' },
    ])).toBe(true)
    expect(hasIndex('purchases', [
      { fieldPath: 'outletId', order: 'ASCENDING' },
      { fieldPath: 'departmentId', order: 'ASCENDING' },
      { fieldPath: 'receivedAt', order: 'DESCENDING' },
    ])).toBe(true)
    expect(hasIndex('supplierPayments', [
      { fieldPath: 'outletId', order: 'ASCENDING' },
      { fieldPath: 'paidAt', order: 'DESCENDING' },
    ])).toBe(true)
  })
})
