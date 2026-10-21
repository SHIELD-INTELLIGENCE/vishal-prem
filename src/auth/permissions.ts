import type {
  Department,
  ID,
  PermissionKey,
  PermissionMap,
  RoleCode,
  UserProfile,
} from '@/types/models'

export interface PermissionDefinition {
  key: PermissionKey
  label: string
  group: 'Overview' | 'Operations' | 'Catalogue' | 'Accounts' | 'Administration'
  description: string
}

export const PERMISSIONS: PermissionDefinition[] = [
  { key: 'dashboardView', label: 'View dashboard', group: 'Overview', description: 'See sales summaries and operational queues.' },
  { key: 'ordersView', label: 'View orders', group: 'Operations', description: 'Read counter orders for assigned outlets and departments.' },
  { key: 'ordersManage', label: 'Create & edit orders', group: 'Operations', description: 'Enter orders, advance preparation status and record print events.' },
  { key: 'ordersCancel', label: 'Cancel orders', group: 'Operations', description: 'Cancel an order with a recorded reason.' },
  { key: 'bookingsView', label: 'View party bookings', group: 'Operations', description: 'Read wedding, birthday, catering and corporate bookings.' },
  { key: 'bookingsManage', label: 'Manage party bookings', group: 'Operations', description: 'Create and update bookings, advances and fulfilment.' },
  { key: 'paymentsView', label: 'View payments', group: 'Accounts', description: 'Read cash and UPI payment records.' },
  { key: 'paymentsManage', label: 'Record payments', group: 'Accounts', description: 'Record payments, advances and refunds.' },
  { key: 'productsView', label: 'View catalogue', group: 'Catalogue', description: 'See products in assigned outlets and departments.' },
  { key: 'productsManage', label: 'Manage catalogue', group: 'Catalogue', description: 'Create and edit product details, pricing and availability.' },
  { key: 'inventoryView', label: 'View inventory', group: 'Operations', description: 'Read raw-material balances, movements and stock counts.' },
  { key: 'inventoryManage', label: 'Manage inventory', group: 'Operations', description: 'Create items, post purchases, issues, wastage, transfers and counts.' },
  { key: 'inventoryAdjust', label: 'Adjust finished stock', group: 'Catalogue', description: 'Record manual finished-product adjustments with a mandatory reason. Does not grant catalogue editing.' },
  { key: 'customersView', label: 'View customers & parties', group: 'Accounts', description: 'Read customer accounts, statements and booking history.' },
  { key: 'customersManage', label: 'Manage customers & parties', group: 'Accounts', description: 'Create and update customer/party accounts.' },
  { key: 'productionView', label: 'View production', group: 'Operations', description: 'Read department production queues, assignments and history.' },
  { key: 'productionManage', label: 'Manage production', group: 'Operations', description: 'Assign work, record partial completion, quality decisions and rework.' },
  { key: 'deliveryView', label: 'View deliveries', group: 'Operations', description: 'Read delivery records, dispatch and reconciliation status.' },
  { key: 'deliveryManage', label: 'Manage deliveries', group: 'Operations', description: 'Create, assign, dispatch and complete deliveries and collections.' },
  { key: 'financeView', label: 'View finance', group: 'Accounts', description: 'Read party statements, expenses, cash sessions and outstanding lists.' },
  { key: 'financeManage', label: 'Manage finance', group: 'Accounts', description: 'Record expenses, cash sessions, handovers and finance corrections.' },
  { key: 'reportsView', label: 'View reports', group: 'Overview', description: 'Access operational, inventory, delivery and finance reports and exports.' },
  { key: 'departmentsManage', label: 'Manage departments', group: 'Administration', description: 'Create and edit departments and outlet assignment.' },
  { key: 'outletsManage', label: 'Manage outlets', group: 'Administration', description: 'Create and edit outlet details.' },
  { key: 'usersManage', label: 'Manage staff & permissions', group: 'Administration', description: 'Invite staff and change roles, scopes and permissions.' },
  { key: 'settingsManage', label: 'Manage business settings', group: 'Administration', description: 'Edit business profile, tax defaults, printing and outlet settings.' },
  { key: 'busyView', label: 'Accounting exports', group: 'Administration', description: 'Export orders and payments for accounting.' },
]

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key)

export const ALL_PERMISSIONS: PermissionMap = PERMISSIONS.reduce(
  (acc, p) => ({ ...acc, [p.key]: true }),
  {} as PermissionMap,
)

const NONE: PermissionMap = PERMISSIONS.reduce(
  (acc, p) => ({ ...acc, [p.key]: false }),
  {} as PermissionMap,
)

function allow(...keys: PermissionKey[]): PermissionMap {
  const map = { ...NONE }
  for (const key of keys) map[key] = true
  return map
}

const DEPARTMENT_OPERATOR: PermissionKey[] = [
  'dashboardView',
  'ordersView',
  'ordersManage',
  'ordersCancel',
  'bookingsView',
  'bookingsManage',
  'paymentsView',
  'paymentsManage',
  'productsView',
  'productsManage',
  'inventoryView',
  'inventoryManage',
  'customersView',
  'customersManage',
  'productionView',
  'productionManage',
  'deliveryView',
  'deliveryManage',
  'reportsView',
  'busyView',
]

export interface RoleDefinition {
  code: RoleCode
  label: string
  description: string
  departmentCode?: string
  permissions: PermissionMap
}

export const ROLES: RoleDefinition[] = [
  {
    code: 'super_admin',
    label: 'Super Admin',
    description: 'Full access to both outlets, all departments, staff, settings and reports.',
    permissions: { ...ALL_PERMISSIONS },
  },
  {
    code: 'cake_admin',
    label: 'Cake Admin',
    description: 'Cake department operations only, scoped to assigned outlets.',
    departmentCode: 'cake',
    permissions: allow(...DEPARTMENT_OPERATOR),
  },
  {
    code: 'sweets_admin',
    label: 'Sweets Admin',
    description: 'Sweets department operations only, scoped to assigned outlets.',
    departmentCode: 'sweets',
    permissions: allow(...DEPARTMENT_OPERATOR),
  },
  {
    code: 'hot_admin',
    label: 'Hot Section Admin',
    description: 'Hot food and patties operations only, scoped to assigned outlets.',
    departmentCode: 'hot',
    permissions: allow(...DEPARTMENT_OPERATOR),
  },
  {
    code: 'gajak_admin',
    label: 'Gajak Admin',
    description: 'Gajak operations only, scoped to assigned outlets.',
    departmentCode: 'gajak',
    permissions: allow(...DEPARTMENT_OPERATOR),
  },
  {
    code: 'manager',
    label: 'Outlet Manager',
    description: 'Runs day-to-day outlet operations across departments. No staff or system settings access.',
    permissions: allow(
      'dashboardView',
      'ordersView',
      'ordersManage',
      'ordersCancel',
      'bookingsView',
      'bookingsManage',
      'paymentsView',
      'paymentsManage',
      'productsView',
      'productsManage',
      'inventoryView',
      'inventoryManage',
      'customersView',
      'customersManage',
      'productionView',
      'productionManage',
      'deliveryView',
      'deliveryManage',
      'financeView',
      'financeManage',
      'reportsView',
      'busyView',
    ),
  },
  {
    code: 'accountant',
    label: 'Accountant',
    description: 'Reads orders and customers, records payments and exports accounting data.',
    permissions: allow(
      'dashboardView',
      'ordersView',
      'customersView',
      'paymentsView',
      'paymentsManage',
      'inventoryView',
      'productionView',
      'deliveryView',
      'financeView',
      'financeManage',
      'reportsView',
      'busyView',
    ),
  },
]

export const ROLE_LABELS: Record<RoleCode, string> = ROLES.reduce(
  (acc, role) => ({ ...acc, [role.code]: role.label }),
  {} as Record<RoleCode, string>,
)

export function roleDefinition(code: RoleCode): RoleDefinition {
  return ROLES.find((role) => role.code === code) ?? ROLES[0]
}

export function defaultPermissionsForRole(code: RoleCode): PermissionMap {
  return { ...roleDefinition(code).permissions }
}

export function isSuperAdmin(profile: UserProfile | null | undefined): boolean {
  return Boolean(profile?.active && profile.role === 'super_admin')
}

export function hasPermission(
  profile: UserProfile | null | undefined,
  permission: PermissionKey,
): boolean {
  if (!profile?.active) return false
  if (profile.role === 'super_admin') return true
  return profile.permissions[permission] === true
}

export function canAccessOutlet(
  profile: UserProfile | null | undefined,
  outletId: ID | undefined,
): boolean {
  if (!profile?.active || !outletId) return false
  if (profile.role === 'super_admin') return true
  return profile.outletIds.includes(outletId)
}

export function canAccessDepartment(
  profile: UserProfile | null | undefined,
  departmentId: ID | undefined,
): boolean {
  if (!profile?.active) return false
  if (hasOutletWideDepartmentScope(profile)) return true
  return Boolean(departmentId && profile.departmentIds.includes(departmentId))
}

/**
 * Super Admins see every department. Outlet managers and accountants are scoped
 * by outlet, not by department, matching their operating responsibility.
 */
export function hasOutletWideDepartmentScope(profile: UserProfile | null | undefined): boolean {
  if (!profile?.active) return false
  return profile.role === 'super_admin' || profile.role === 'manager' || profile.role === 'accountant'
}

export function isDepartmentAdmin(profile: UserProfile | null | undefined): boolean {
  if (!profile) return false
  return ['cake_admin', 'sweets_admin', 'hot_admin', 'gajak_admin'].includes(profile.role)
}

/** Departments the current user may operate in for the selected outlet. */
export function scopedDepartments(
  profile: UserProfile | null | undefined,
  departments: Department[],
  outletId: ID | undefined,
): Department[] {
  if (!profile) return []
  return departments.filter((department) => {
    if (!department.active) return false
    if (outletId && !department.outletIds.includes(outletId)) return false
    if (hasOutletWideDepartmentScope(profile)) return true
    return profile.departmentIds.includes(department.id)
  })
}
