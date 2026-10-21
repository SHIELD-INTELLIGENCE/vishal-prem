import { describe, expect, it } from 'vitest'
import { canDeleteOwnAccount, isDeleteConfirmationValid } from '@/features/account/deleteAccount'

describe('self-service account deletion', () => {
  it('allows password-based staff accounts to delete themselves', () => {
    expect(canDeleteOwnAccount('manager', true)).toBe(true)
    expect(canDeleteOwnAccount('cake_admin', true)).toBe(true)
  })

  it('protects the Super Admin account from self-service deletion', () => {
    expect(canDeleteOwnAccount('super_admin', true)).toBe(false)
  })

  it('blocks accounts that do not sign in with a password', () => {
    expect(canDeleteOwnAccount('manager', false)).toBe(false)
  })

  it('requires the exact DELETE confirmation, ignoring case and padding', () => {
    expect(isDeleteConfirmationValid('DELETE')).toBe(true)
    expect(isDeleteConfirmationValid('  delete  ')).toBe(true)
    expect(isDeleteConfirmationValid('Delete')).toBe(true)
    expect(isDeleteConfirmationValid('delete account')).toBe(false)
    expect(isDeleteConfirmationValid('')).toBe(false)
  })
})
