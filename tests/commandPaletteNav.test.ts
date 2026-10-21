import { describe, expect, it } from 'vitest'
import {
  clampActive,
  isPaletteNavigationKey,
  nextActiveIndex,
} from '@/components/layout/commandPaletteNav'

describe('command palette keyboard navigation', () => {
  it('moves down and up by one item', () => {
    expect(nextActiveIndex(0, 'ArrowDown', 5)).toBe(1)
    expect(nextActiveIndex(3, 'ArrowDown', 5)).toBe(4)
    expect(nextActiveIndex(4, 'ArrowUp', 5)).toBe(3)
    expect(nextActiveIndex(1, 'ArrowUp', 5)).toBe(0)
  })

  it('does not wrap past the first or last item', () => {
    expect(nextActiveIndex(4, 'ArrowDown', 5)).toBe(4)
    expect(nextActiveIndex(0, 'ArrowUp', 5)).toBe(0)
  })

  it('supports Home and End', () => {
    expect(nextActiveIndex(3, 'Home', 10)).toBe(0)
    expect(nextActiveIndex(2, 'End', 10)).toBe(9)
  })

  it('handles an empty result list without producing a negative index', () => {
    expect(nextActiveIndex(0, 'ArrowDown', 0)).toBe(0)
    expect(nextActiveIndex(0, 'ArrowUp', 0)).toBe(0)
    expect(nextActiveIndex(0, 'Home', 0)).toBe(0)
    expect(nextActiveIndex(0, 'End', 0)).toBe(0)
    expect(clampActive(7, 0)).toBe(0)
  })

  it('clamps an out-of-range active index after filtering', () => {
    expect(clampActive(9, 3)).toBe(2)
    expect(clampActive(-4, 3)).toBe(0)
    expect(clampActive(Number.NaN, 3)).toBe(0)
  })

  it('recognises only the navigation keys', () => {
    expect(isPaletteNavigationKey('ArrowDown')).toBe(true)
    expect(isPaletteNavigationKey('End')).toBe(true)
    expect(isPaletteNavigationKey('Enter')).toBe(false)
    expect(isPaletteNavigationKey('Tab')).toBe(false)
  })
})
