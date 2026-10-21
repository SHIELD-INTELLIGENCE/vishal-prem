import {
  BadgeIndianRupee,
  BookOpenCheck,
  CalendarHeart,
  ChartNoAxesCombined,
  ChefHat,
  ClipboardCheck,
  CircleHelp,
  ClipboardList,
  LayoutDashboard,
  Package,
  PackageSearch,
  ReceiptText,
  Truck,
  Settings2,
  ShieldCheck,
  Store,
  Users,
  WalletCards,
} from 'lucide-react'
import type { PermissionKey } from '@/types/models'
import { ADMIN_BASE, adminPath, isAdminPath, stripAdminPrefix } from '@/routing'

export interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  permission: PermissionKey
  end?: boolean
  description: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { to: ADMIN_BASE, label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboardView', end: true, description: 'Today at a glance' },
    ],
  },
  {
    label: 'Orders & Bookings',
    items: [
      { to: adminPath('/orders'), label: 'Orders', icon: ClipboardList, permission: 'ordersView', description: 'Counter orders and queue' },
      { to: adminPath('/bookings'), label: 'Party bookings', icon: CalendarHeart, permission: 'bookingsView', description: 'Weddings, parties and catering' },
      { to: adminPath('/payments'), label: 'Payments', icon: WalletCards, permission: 'paymentsView', description: 'Cash, UPI and refunds' },
      { to: adminPath('/deliveries'), label: 'Deliveries', icon: Truck, permission: 'deliveryView', description: 'Dispatch, proof and collection' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: adminPath('/production'), label: 'Production', icon: ClipboardCheck, permission: 'productionView', description: 'Department queues and quality' },
      { to: adminPath('/inventory'), label: 'Inventory', icon: PackageSearch, permission: 'inventoryView', description: 'Raw materials and packaging' },
      { to: adminPath('/finance'), label: 'Finance', icon: BadgeIndianRupee, permission: 'financeView', description: 'Party balances, expenses and cash' },
    ],
  },
  {
    label: 'Catalogue',
    items: [
      { to: adminPath('/products'), label: 'Products', icon: Package, permission: 'productsView', description: 'Product master and pricing' },
      { to: adminPath('/departments'), label: 'Departments', icon: ChefHat, permission: 'departmentsManage', description: 'Cake, sweets, hot and gajak' },
    ],
  },
  {
    label: 'Customers',
    items: [
      { to: adminPath('/customers'), label: 'Customers & parties', icon: Users, permission: 'customersView', description: 'Accounts and contacts' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { to: adminPath('/reports'), label: 'Reports', icon: ChartNoAxesCombined, permission: 'reportsView', description: 'Sales and operations reports' },
      { to: adminPath('/busy'), label: 'Accounting export', icon: BookOpenCheck, permission: 'busyView', description: 'Export sales, payments and balances' },
    ],
  },
  {
    label: 'Business Management',
    items: [
      { to: adminPath('/outlets'), label: 'Outlets', icon: Store, permission: 'outletsManage', description: 'Both outlet locations' },
      { to: adminPath('/settings'), label: 'Settings', icon: Settings2, permission: 'settingsManage', description: 'Business and system settings' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: adminPath('/users'), label: 'Staff & permissions', icon: ShieldCheck, permission: 'usersManage', description: 'Staff roles and invites' },
    ],
  },
  {
    label: 'Help & Support',
    items: [
      { to: adminPath('/help'), label: 'Help centre', icon: CircleHelp, permission: 'dashboardView', description: 'Guides and troubleshooting' },
    ],
  },
]

export const QUICK_ACTIONS: Array<NavItem & { requires: PermissionKey }> = [
  { to: adminPath('/orders/new'), label: 'New counter order', icon: ReceiptText, permission: 'ordersManage', requires: 'ordersManage', description: 'Open the order entry screen' },
  { to: adminPath('/bookings/new'), label: 'New party booking', icon: CalendarHeart, permission: 'bookingsManage', requires: 'bookingsManage', description: 'Open the booking form' },
  { to: adminPath('/products/new'), label: 'New product', icon: Package, permission: 'productsManage', requires: 'productsManage', description: 'Add a catalogue item' },
  { to: adminPath('/customers/new'), label: 'New customer or party', icon: Users, permission: 'customersManage', requires: 'customersManage', description: 'Create an account' },
  { to: adminPath('/payments'), label: 'Record a payment', icon: BadgeIndianRupee, permission: 'paymentsView', requires: 'paymentsView', description: 'Open payment records' },
]

/**
 * Human title for the current management path. Uses the path after the
 * `/admin` prefix so the same rules work for every nested route.
 */
export function routeTitle(pathname: string): string {
  if (!isAdminPath(pathname)) return 'Vishal Prem'
  const path = stripAdminPrefix(pathname)
  if (path === '/') return 'Dashboard'
  if (path.startsWith('/orders/new')) return 'New order'
  if (/^\/orders\/[^/]+/.test(path)) return 'Order details'
  if (path === '/orders') return 'Orders'
  if (path.startsWith('/bookings/new')) return 'New booking'
  if (/^\/bookings\/[^/]+\/edit/.test(path)) return 'Edit booking'
  if (/^\/bookings\/[^/]+/.test(path)) return 'Booking details'
  if (path === '/bookings') return 'Party bookings'
  if (path === '/payments') return 'Payments'
  if (path === '/production') return 'Production'
  if (path === '/inventory') return 'Inventory'
  if (path === '/deliveries') return 'Deliveries'
  if (path === '/finance') return 'Finance'
  if (path.startsWith('/customers/new')) return 'New customer'
  if (/^\/customers\/[^/]+\/edit/.test(path)) return 'Edit customer'
  if (/^\/customers\/[^/]+/.test(path)) return 'Customer account'
  if (path === '/customers') return 'Customers & parties'
  if (path.startsWith('/products/new')) return 'New product'
  if (/^\/products\/[^/]+\/edit/.test(path)) return 'Edit product'
  if (/^\/products\/[^/]+/.test(path)) return 'Product details'
  if (path === '/products') return 'Products'
  if (/^\/departments\/[^/]+/.test(path)) return 'Department workspace'
  if (path === '/departments') return 'Departments'
  if (path === '/outlets') return 'Outlets'
  if (path === '/reports') return 'Reports'
  if (path === '/users') return 'Staff & permissions'
  if (path === '/busy') return 'Accounting export'
  if (path === '/settings') return 'Settings'
  if (path === '/help') return 'Help'
  return 'Workspace'
}

/**
 * Breadcrumbs for the management shell. Root links are rebuilt with the
 * `/admin` prefix so they always point at the management route.
 */
export function breadcrumbTrail(pathname: string): Array<{ label: string; to?: string }> {
  if (!isAdminPath(pathname)) return [{ label: 'Home' }]
  const path = stripAdminPrefix(pathname)
  if (path === '/') return [{ label: 'Dashboard' }]
  // Department workspaces are reachable by department operators who cannot open
  // the departments administration page, so do not link the crumb to it.
  if (/^\/departments\/[^/]+/.test(path)) return [{ label: 'Department workspace' }]
  const parts = path.split('/').filter(Boolean)
  const root = parts[0]
  const rootMap: Record<string, string> = {
    orders: 'Orders',
    bookings: 'Party bookings',
    payments: 'Payments',
    production: 'Production',
    inventory: 'Inventory',
    deliveries: 'Deliveries',
    finance: 'Finance',
    customers: 'Customers & parties',
    products: 'Products',
    departments: 'Departments',
    outlets: 'Outlets',
    reports: 'Reports',
    users: 'Staff & permissions',
    busy: 'Accounting export',
    settings: 'Settings',
    help: 'Help',
  }
  const trail: Array<{ label: string; to?: string }> = [
    { label: rootMap[root] ?? 'Workspace', to: adminPath(`/${root}`) },
  ]
  if (parts[1]) {
    if (parts[1] === 'new') trail.push({ label: 'New' })
    else if (parts[2] === 'edit') trail.push({ label: 'Edit' })
    else trail.push({ label: routeTitle(pathname) })
  }
  return trail
}
