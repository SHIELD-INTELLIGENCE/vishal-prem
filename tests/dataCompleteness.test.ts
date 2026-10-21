import { describe, expect, it } from 'vitest'
import { capLabels, isCapped } from '@/lib/dataCompleteness'

describe('capped read disclosure', () => {
  it('treats a cap-plus-one read as incomplete', () => {
    expect(isCapped(500, 500)).toBe(false)
    expect(isCapped(501, 500)).toBe(true)
  })

  it('lists every capped source and omits complete ones', () => {
    expect(capLabels([
      { label: 'orders', loaded: 501, cap: 500 },
      { label: 'payments', loaded: 1000, cap: 1000 },
      { label: 'party accounts', loaded: 1200, cap: 500 },
    ])).toEqual(['orders', 'party accounts'])
  })
})
