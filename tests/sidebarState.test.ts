import { describe, expect, it } from 'vitest'
import { resolveSidebarExpanded } from '@/components/layout/sidebarState'

describe('sidebar hover expansion', () => {
  it('always expands when the saved preference is expanded', () => {
    expect(resolveSidebarExpanded({ collapsed: false, hovered: false, focusWithin: false, canHover: false })).toBe(true)
    expect(resolveSidebarExpanded({ collapsed: false, hovered: false, focusWithin: false, canHover: true })).toBe(true)
  })

  it('expands a collapsed rail on hover for pointer devices', () => {
    expect(resolveSidebarExpanded({ collapsed: true, hovered: true, focusWithin: false, canHover: true })).toBe(true)
  })

  it('expands a collapsed rail on keyboard focus without hover', () => {
    expect(resolveSidebarExpanded({ collapsed: true, hovered: false, focusWithin: true, canHover: true })).toBe(true)
  })

  it('returns to the collapsed preference when hover and focus end', () => {
    expect(resolveSidebarExpanded({ collapsed: true, hovered: false, focusWithin: false, canHover: true })).toBe(false)
  })

  it('never auto-expands on touch or non-hover devices', () => {
    expect(resolveSidebarExpanded({ collapsed: true, hovered: true, focusWithin: true, canHover: false })).toBe(false)
  })
})
