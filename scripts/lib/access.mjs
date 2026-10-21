/**
 * Canonical Super Admin access definition shared by the local scripts
 * (emulator seed and real-project bootstrap).
 *
 * IMPORTANT: this list must stay identical to PERMISSION_KEYS in
 * src/auth/permissions.ts. tests/bootstrap.test.ts asserts equality so the
 * two cannot drift apart silently.
 */
export const PERMISSION_KEYS = [
  'dashboardView',
  'ordersView',
  'ordersManage',
  'ordersCancel',
  'bookingsView',
  'bookingsManage',
  'paymentsView',
  'paymentsManage',
  'productionView',
  'productionManage',
  'deliveryView',
  'deliveryManage',
  'financeView',
  'financeManage',
  'productsView',
  'productsManage',
  'inventoryView',
  'inventoryManage',
  'inventoryAdjust',
  'customersView',
  'customersManage',
  'reportsView',
  'departmentsManage',
  'outletsManage',
  'usersManage',
  'settingsManage',
  'busyView',
]

export const ALL_PERMISSIONS = Object.freeze(
  Object.fromEntries(PERMISSION_KEYS.map((key) => [key, true])),
)

/**
 * Builds a Super Admin profile document that matches the UserProfile schema.
 * The permissions are always the full canonical set; callers cannot narrow or
 * widen them, which keeps every bootstrap path identical.
 */
export function buildSuperAdminProfile({ uid, email, displayName, outletIds, now }) {
  return {
    uid,
    displayName: (displayName || '').trim() || 'Super Admin',
    email: String(email).trim().toLowerCase(),
    phone: '',
    role: 'super_admin',
    permissions: { ...ALL_PERMISSIONS },
    outletIds: [...new Set(outletIds ?? [])],
    departmentIds: [],
    active: true,
    createdAt: now,
    updatedAt: now,
  }
}

/** Shape check used before any write, so a malformed profile is never stored. */
export function isWellFormedSuperAdmin(profile) {
  if (!profile || typeof profile !== 'object') return false
  if (profile.role !== 'super_admin') return false
  if (profile.active !== true) return false
  if (!Array.isArray(profile.outletIds) || !Array.isArray(profile.departmentIds)) return false
  if (!profile.uid || !profile.email) return false
  const keys = Object.keys(profile.permissions ?? {})
  if (keys.length !== PERMISSION_KEYS.length) return false
  return PERMISSION_KEYS.every((key) => profile.permissions[key] === true)
}
