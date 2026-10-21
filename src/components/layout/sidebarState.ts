/**
 * Sidebar expansion is a combination of the saved preference and temporary
 * hover/focus state. Keeping the decision pure makes it testable and makes the
 * "never destroy the saved preference" rule explicit.
 */
export interface SidebarExpansionInput {
  /** Saved preference: the user chose compact navigation. */
  collapsed: boolean
  hovered: boolean
  focusWithin: boolean
  /** Only hover-capable, fine-pointer devices may expand on hover. */
  canHover: boolean
}

export function resolveSidebarExpanded({
  collapsed,
  hovered,
  focusWithin,
  canHover,
}: SidebarExpansionInput): boolean {
  if (!collapsed) return true
  if (!canHover) return false
  return hovered || focusWithin
}
