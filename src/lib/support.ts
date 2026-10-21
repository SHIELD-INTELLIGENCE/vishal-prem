/**
 * SHIELD Intelligence operations contact.
 *
 * A browser session cannot delete a Firebase Authentication user, so permanent
 * sign-in removal is a manual step performed by an authorised operator through
 * the Firebase Console. This is the single place that contact address is
 * defined; the staff-removal UI and help content both read from here.
 */
export const SHIELD_SUPPORT_EMAIL = 'shield@shieldintelligence.in'

/**
 * Optional phone contact. Left empty because none is published yet; the UI only
 * renders a phone row when this is non-empty.
 */
export const SHIELD_SUPPORT_PHONE = ''
