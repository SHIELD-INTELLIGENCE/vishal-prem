/**
 * Self-service account deletion rules.
 *
 * Deleting a Firebase Auth user is irreversible. The Super Admin account is
 * deliberately excluded so a one-person workspace cannot lock itself out;
 * removing it is an explicit Firebase Console / Admin SDK action.
 */
export function canDeleteOwnAccount(role: string | null | undefined, hasPasswordProvider: boolean): boolean {
  if (!hasPasswordProvider) return false
  return role !== 'super_admin'
}

/** The destructive action requires the user to type DELETE (case-insensitive). */
export function isDeleteConfirmationValid(value: string): boolean {
  return value.trim().toUpperCase() === 'DELETE'
}
