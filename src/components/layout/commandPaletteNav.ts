/**
 * Pure keyboard-navigation logic for the command palette.
 *
 * Kept free of DOM access so it can be unit tested in the node test
 * environment. The component owns focus and scrolling; this module only
 * decides which result should be active next.
 */
export type PaletteNavigationKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End'

export function isPaletteNavigationKey(key: string): key is PaletteNavigationKey {
  return key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End'
}

export function clampActive(current: number, length: number): number {
  if (!Number.isFinite(current) || length <= 0) return 0
  return Math.min(Math.max(Math.trunc(current), 0), length - 1)
}

export function nextActiveIndex(current: number, key: PaletteNavigationKey, length: number): number {
  const last = length - 1
  if (length <= 0) return 0
  const safe = clampActive(current, length)
  switch (key) {
    case 'ArrowDown':
      return Math.min(safe + 1, last)
    case 'ArrowUp':
      return Math.max(safe - 1, 0)
    case 'Home':
      return 0
    case 'End':
      return last
  }
}
