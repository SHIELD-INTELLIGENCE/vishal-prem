/**
 * Route constants and pure helpers.
 *
 * The public site owns `/`. The management application lives entirely under
 * `/admin`, so a link can never accidentally point at a management screen from
 * the public site (and vice versa).
 *
 * Kept free of React and Firebase so it can be unit tested in the node
 * environment and reused by guards, navigation, links and tests alike.
 */

export const PUBLIC_HOME = '/'
export const ADMIN_BASE = '/admin'
export const ADMIN_LOGIN = '/admin/login'
export const ADMIN_FORGOT_PASSWORD = '/admin/forgot-password'
export const ADMIN_JOIN = '/admin/join'
export const ADMIN_SETUP = '/admin/setup'

/** Builds an absolute management path from a path relative to `/admin`. */
export function adminPath(path = ''): string {
  if (!path || path === '/') return ADMIN_BASE
  return `${ADMIN_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

/** True for `/admin` and every nested management route. */
export function isAdminPath(pathname: string): boolean {
  return pathname === ADMIN_BASE || pathname.startsWith(`${ADMIN_BASE}/`)
}

/** Strips the `/admin` prefix; `/admin` becomes `/`. */
export function stripAdminPrefix(pathname: string): string {
  if (pathname === ADMIN_BASE) return '/'
  if (pathname.startsWith(`${ADMIN_BASE}/`)) return pathname.slice(ADMIN_BASE.length)
  return pathname
}

/** Auth screens must never be used as a post-login destination. */
function isAdminAuthPath(pathname: string): boolean {
  return (
    pathname === ADMIN_LOGIN ||
    pathname === ADMIN_FORGOT_PASSWORD ||
    pathname === ADMIN_JOIN ||
    pathname.startsWith(`${ADMIN_JOIN}/`)
  )
}

/**
 * Returns a safe post-login destination.
 *
 * Only same-app `/admin...` paths are accepted. Anything else — including the
 * public home, auth screens, protocol-relative URLs or absolute URLs that
 * merely contain `/admin` — falls back to the management dashboard. This
 * prevents open redirects and redirect loops.
 */
export function safeAdminDestination(from: string | null | undefined): string {
  if (!from) return ADMIN_BASE
  if (!/^\/admin(?:[/?#]|$)/.test(from)) return ADMIN_BASE
  if (isAdminAuthPath(from.split(/[?#]/, 1)[0])) return ADMIN_BASE
  return from
}
