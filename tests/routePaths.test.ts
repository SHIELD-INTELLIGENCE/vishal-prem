import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ADMIN_BASE,
  adminPath,
  isAdminPath,
  safeAdminDestination,
  stripAdminPrefix,
} from '@/routing'
import { NAV_GROUPS, QUICK_ACTIONS, breadcrumbTrail, routeTitle } from '@/navigation'

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url))

function listSources(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...listSources(full))
    else if (/\.tsx?$/.test(entry.name)) files.push(full)
  }
  return files
}

/**
 * Matches a link target that still points at a legacy root-level management
 * path (`to="/orders"`, ``navigate(`/bookings/${id}`)``, `href="/help"`).
 * `adminPath('/orders')` calls and comments are not link targets, so they are
 * intentionally not matched.
 */
const LEGACY_LINK =
  /(?:to=|to:\s*|navigate\(|href=)\s*\{?\s*(["'`])\/(orders|bookings|payments|customers|products|departments|outlets|reports|users|busy|settings|help|print|setup|login|forgot-password|join)([/?"'`])/g

describe('route helpers', () => {
  it('reserves the root for the public site and everything else for /admin', () => {
    expect(isAdminPath('/')).toBe(false)
    expect(isAdminPath('/admin')).toBe(true)
    expect(isAdminPath('/admin/orders')).toBe(true)
    expect(isAdminPath('/admin/orders/abc/edit')).toBe(true)
    // A path that merely starts with the same letters is still public.
    expect(isAdminPath('/administrator')).toBe(false)
  })

  it('builds and strips the admin prefix', () => {
    expect(adminPath()).toBe(ADMIN_BASE)
    expect(adminPath('/orders')).toBe('/admin/orders')
    expect(adminPath('orders')).toBe('/admin/orders')
    expect(stripAdminPrefix('/admin')).toBe('/')
    expect(stripAdminPrefix('/admin/orders')).toBe('/orders')
    expect(stripAdminPrefix('/orders')).toBe('/orders')
  })

  it('returns a safe post-login destination', () => {
    expect(safeAdminDestination('/admin/orders/1?tab=items')).toBe('/admin/orders/1?tab=items')
    expect(safeAdminDestination('/admin')).toBe('/admin')
    // Public paths, auth screens and lookalike paths fall back to the dashboard.
    expect(safeAdminDestination('/')).toBe('/admin')
    expect(safeAdminDestination('/admin/login')).toBe('/admin')
    expect(safeAdminDestination('/admin/forgot-password')).toBe('/admin')
    expect(safeAdminDestination('/admin/join/token')).toBe('/admin')
    expect(safeAdminDestination('/administrator')).toBe('/admin')
    expect(safeAdminDestination('//evil.example/admin')).toBe('/admin')
    expect(safeAdminDestination('https://evil.example/admin')).toBe('/admin')
    expect(safeAdminDestination(undefined)).toBe('/admin')
  })
})

describe('navigation data', () => {
  it('points every sidebar and command-palette target at /admin', () => {
    const targets = [
      ...NAV_GROUPS.flatMap((group) => group.items.map((item) => item.to)),
      ...QUICK_ACTIONS.map((action) => action.to),
    ]
    expect(targets.length).toBeGreaterThan(0)
    for (const target of targets) {
      expect(isAdminPath(target), `${target} should be an /admin path`).toBe(true)
    }
  })

  it('titles and breadcrumbs resolve for admin paths', () => {
    expect(routeTitle('/admin')).toBe('Dashboard')
    expect(routeTitle('/admin/orders')).toBe('Orders')
    expect(routeTitle('/admin/orders/new')).toBe('New order')
    expect(routeTitle('/admin/users')).toBe('Staff & permissions')
    expect(routeTitle('/')).toBe('Vishal Prem')

    expect(breadcrumbTrail('/admin')).toEqual([{ label: 'Dashboard' }])
    expect(breadcrumbTrail('/admin/orders')).toEqual([{ label: 'Orders', to: '/admin/orders' }])
    expect(breadcrumbTrail('/admin/orders/new')).toEqual([
      { label: 'Orders', to: '/admin/orders' },
      { label: 'New' },
    ])
    expect(breadcrumbTrail('/admin/departments/cake')).toEqual([{ label: 'Department workspace' }])
  })
})

describe('no legacy root-level management links remain', () => {
  it('finds no link target pointing at a legacy root path', () => {
    const offenders: string[] = []
    for (const file of listSources(SRC_DIR)) {
      const contents = readFileSync(file, 'utf8')
      for (const match of contents.matchAll(LEGACY_LINK)) {
        offenders.push(`${relative(SRC_DIR, file)}: ${match[0].trim()}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
