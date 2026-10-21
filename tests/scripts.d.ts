/**
 * Type declarations for the local Node scripts used by the test suite.
 * The scripts are plain .mjs (no TypeScript build step), so the shape they
 * expose is declared here for the unit tests that import them.
 */
declare module '*/lib/access.mjs' {
  export const PERMISSION_KEYS: string[]
  export const ALL_PERMISSIONS: Readonly<Record<string, boolean>>
  export function buildSuperAdminProfile(input: {
    uid: string
    email: string
    displayName?: string
    outletIds?: string[]
    now: string
  }): Record<string, unknown>
  export function isWellFormedSuperAdmin(profile: unknown): boolean
}
