import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  AlertTriangle,
  ChevronDown,
  KeyRound,
  Keyboard,
  LogOut,
  MailCheck,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Store,
  Trash2,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission, ROLE_LABELS } from '@/auth/permissions'
import { breadcrumbTrail, routeTitle } from '@/navigation'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { TextField } from '@/components/ui/Field'
import { Tabs } from '@/components/ui/Tabs'
import { normalizePhone, isValidPhone } from '@/lib/validation'
import { friendlyFirebaseError } from '@/lib/errors'
import { canDeleteOwnAccount, isDeleteConfirmationValid } from '@/features/account/deleteAccount'

const profileSchema = z.object({
  displayName: z.string().trim().min(2, 'Enter your name').max(60),
  phone: z.string().trim().refine((value) => value === '' || isValidPhone(value), 'Enter a valid 10-digit mobile number').optional(),
})
type ProfileValues = z.infer<typeof profileSchema>

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z.string().min(8, 'Use at least 8 characters').max(128, 'Use 128 characters or fewer'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
type PasswordValues = z.infer<typeof passwordSchema>

const emailSchema = z.object({
  newEmail: z.string().trim().email('Enter a valid email address'),
  currentPassword: z.string().min(1, 'Enter your current password'),
})
type EmailValues = z.infer<typeof emailSchema>

export function Topbar({
  onOpenMobile,
  onOpenPalette,
  onOpenShortcuts,
}: {
  onOpenMobile: () => void
  onOpenPalette: () => void
  onOpenShortcuts: () => void
}) {
  const { profile, signOut } = useAuth()
  const { outlets, selectedOutletId, setSelectedOutletId } = useWorkspace()
  const location = useLocation()
  const navigate = useNavigate()
  const [accountOpen, setAccountOpen] = useState(false)
  const crumbs = breadcrumbTrail(location.pathname)
  const title = routeTitle(location.pathname)

  if (!profile) return null

  async function handleSignOut() {
    try {
      await signOut()
      toast.success('Signed out')
      navigate('/admin/login', { replace: true })
    } catch {
      toast.error('Could not sign out. Try again.')
    }
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-ink-200/70 bg-ivory-50/85 backdrop-blur-xl no-print">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={onOpenMobile}
            className="rounded-lg p-2 text-ink-600 hover:bg-ivory-100 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <nav aria-label="Breadcrumb" className="hidden items-center gap-1.5 text-[11px] text-ink-500 sm:flex">
              <Link to="/admin" className="hover:text-brand-700">Workspace</Link>
              {crumbs.map((crumb, index) => (
                <span key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                  <span className="text-ink-300">/</span>
                  {crumb.to && index < crumbs.length - 1 ? (
                    <Link to={crumb.to} className="hover:text-brand-700">{crumb.label}</Link>
                  ) : (
                    <span className={cn(index === crumbs.length - 1 && 'font-semibold text-ink-700')}>{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
            <p className="truncate text-sm font-semibold text-ink-900 sm:hidden">{title}</p>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="hidden items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-2 py-1.5 sm:flex">
              <Store className="h-3.5 w-3.5 text-brand-600" aria-hidden />
              <label htmlFor="outlet-switcher" className="sr-only">Active outlet</label>
              <select
                id="outlet-switcher"
                value={selectedOutletId ?? ''}
                onChange={(event) => setSelectedOutletId(event.target.value)}
                disabled={outlets.length <= 1}
                className="max-w-[170px] cursor-pointer bg-transparent pr-1 text-xs font-semibold text-ink-800 focus:outline-none disabled:cursor-default"
                title="Switch outlet"
              >
                {outlets.map((outlet) => (
                  <option key={outlet.id} value={outlet.id}>{outlet.name}</option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={onOpenPalette}
              className="hidden h-9 items-center gap-2 rounded-lg border border-ink-200 bg-white px-2.5 text-xs text-ink-500 transition hover:border-ink-300 hover:text-ink-700 md:flex"
              aria-label="Open command menu (Control or Command + K)"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Jump to…</span>
              <span className="key-hint ml-2">⌘K</span>
            </button>

            {hasPermission(profile, 'ordersManage') && (
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <NavLink to="/admin/orders/new" aria-label="New order">
                  <Plus className="h-4 w-4" /> New order
                </NavLink>
              </Button>
            )}

            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-xl p-0.5 pr-1.5 transition hover:bg-ivory-100"
                  aria-label="Open profile menu"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-xs font-bold text-white">
                    {initials(profile.displayName)}
                  </span>
                  <span className="hidden text-left xl:block">
                    <span className="block max-w-[130px] truncate text-xs font-semibold text-ink-800">{profile.displayName}</span>
                    <span className="block text-[10px] text-ink-500">{ROLE_LABELS[profile.role]}</span>
                  </span>
                  <ChevronDown className="hidden h-3.5 w-3.5 text-ink-400 xl:block" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  className="z-50 w-64 rounded-xl border border-ink-200 bg-white p-1.5 shadow-float"
                >
                  <div className="border-b border-ink-100 px-2.5 py-2">
                    <p className="truncate text-sm font-semibold text-ink-900">{profile.displayName}</p>
                    <p className="truncate text-[11px] text-ink-500">{profile.email}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-brand-700">{ROLE_LABELS[profile.role]}</p>
                  </div>
                  <DropdownMenu.Item
                    onSelect={() => setAccountOpen(true)}
                    className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink-700 outline-none data-[highlighted]:bg-ivory-100"
                  >
                    <UserRound className="h-4 w-4" /> Account settings
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={onOpenShortcuts}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink-700 outline-none data-[highlighted]:bg-ivory-100"
                  >
                    <Keyboard className="h-4 w-4" /> Keyboard shortcuts
                  </DropdownMenu.Item>
                  {hasPermission(profile, 'settingsManage') && (
                    <DropdownMenu.Item asChild>
                      <Link
                        to="/admin/settings"
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink-700 outline-none data-[highlighted]:bg-ivory-100"
                      >
                        <Settings className="h-4 w-4" /> Business settings
                      </Link>
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Separator className="my-1 h-px bg-ink-100" />
                  <DropdownMenu.Item
                    onSelect={() => void handleSignOut()}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-brand-700 outline-none data-[highlighted]:bg-brand-50"
                  >
                    <LogOut className="h-4 w-4" /> Sign out
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </header>
      <AccountSettingsDialog open={accountOpen} onOpenChange={setAccountOpen} />
    </>
  )
}

function AccountSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const {
    profile,
    firebaseUser,
    updateOwnProfile,
    changePassword,
    deleteAccount,
    requestEmailChange,
    resetPassword,
    refreshAuthUser,
    syncProfileEmail,
    hasPasswordProvider,
  } = useAuth()
  const [tab, setTab] = useState('profile')
  const [saving, setSaving] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)
  const [sendingEmailLink, setSendingEmailLink] = useState(false)
  const [checkingIdentity, setCheckingIdentity] = useState(false)
  const [emailPending, setEmailPending] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: profile?.displayName ?? '', phone: profile?.phone ?? '' },
  })
  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })
  const emailForm = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { newEmail: '', currentPassword: '' },
  })

  const canManageEmail = profile?.role === 'super_admin'
  const authEmail = firebaseUser?.email ?? ''
  const profileEmail = profile?.email ?? ''
  const emailNeedsSync = Boolean(
    authEmail && profileEmail && authEmail.toLowerCase() !== profileEmail.toLowerCase(),
  )

  useEffect(() => {
    if (!open) return
    setTab('profile')
    setEmailPending(null)
    setDeleteOpen(false)
    setDeleteConfirm('')
    setDeletePassword('')
    passwordForm.reset({ currentPassword: '', newPassword: '', confirmPassword: '' })
    emailForm.reset({ newEmail: '', currentPassword: '' })
    if (profile) profileForm.reset({ displayName: profile.displayName, phone: profile.phone ?? '' })
    // Refresh Firebase Auth so a just-verified email change is visible.
    void refreshAuthUser().catch(() => undefined)
    // Only re-run when the dialog opens; field edits should not reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function onSaveProfile(values: ProfileValues) {
    try {
      setSaving(true)
      await updateOwnProfile({ displayName: values.displayName, phone: values.phone ? normalizePhone(values.phone) : '' })
      toast.success('Profile updated')
      onOpenChange(false)
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setSaving(false)
    }
  }

  async function onChangePassword(values: PasswordValues) {
    try {
      setChangingPassword(true)
      await changePassword(values.currentPassword, values.newPassword)
      passwordForm.reset({ currentPassword: '', newPassword: '', confirmPassword: '' })
      toast.success('Password updated. Use the new password next time you sign in.')
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setChangingPassword(false)
    }
  }

  async function onDeleteAccount() {
    if (!canDeleteOwnAccount(profile?.role, hasPasswordProvider)) {
      toast.error(
        profile?.role === 'super_admin'
          ? 'Super Admin accounts cannot be deleted here. Remove it from the Firebase Console after a replacement exists.'
          : 'This account signs in with another provider. Remove it there or ask a Super Admin.',
      )
      return
    }
    if (!isDeleteConfirmationValid(deleteConfirm)) {
      toast.error('Type DELETE to confirm.')
      return
    }
    if (!deletePassword) {
      toast.error('Enter your current password.')
      return
    }
    try {
      setDeleting(true)
      await deleteAccount(deletePassword)
      toast.success('Account deleted. You have been signed out.')
      onOpenChange(false)
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setDeleting(false)
    }
  }

  async function onRequestEmailChange(values: EmailValues) {
    try {
      setSendingEmailLink(true)
      await requestEmailChange(values.newEmail, values.currentPassword)
      setEmailPending(values.newEmail.trim().toLowerCase())
      emailForm.reset({ newEmail: '', currentPassword: '' })
      toast.success('Verification link sent. Check the new inbox to finish the change.')
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setSendingEmailLink(false)
    }
  }

  async function onCheckIdentity() {
    try {
      setCheckingIdentity(true)
      const user = await refreshAuthUser()
      const latestEmail = user?.email ?? ''
      if (!latestEmail) {
        toast.error('Could not read the sign-in email. Sign in again and retry.')
        return
      }
      if (latestEmail.toLowerCase() === profileEmail.toLowerCase()) {
        toast.success('Sign-in email and workspace email already match.')
        return
      }
      if (!user?.emailVerified) {
        toast.info('The new address is not verified yet. Open the link in the verification email first.')
        return
      }
      const synced = await syncProfileEmail()
      if (synced) toast.success(`Workspace email updated to ${latestEmail}.`)
      else toast.error('The workspace email could not be updated. A Super Admin must do this.')
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setCheckingIdentity(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Account settings"
      description="Your profile, sign-in email and password. Role, permissions and outlet access stay under Super Admin control."
      size="md"
    >
      <Tabs
        tabs={[
          { id: 'profile', label: 'Profile', icon: <UserRound className="h-4 w-4" /> },
          { id: 'password', label: 'Password & security', icon: <KeyRound className="h-4 w-4" /> },
          ...(canManageEmail
            ? [{ id: 'email', label: 'Sign-in email', icon: <MailCheck className="h-4 w-4" /> }]
            : []),
        ]}
        active={tab}
        onChange={setTab}
        ariaLabel="Account settings sections"
        className="mb-4"
      />

      {tab === 'profile' && (
        <form onSubmit={profileForm.handleSubmit(onSaveProfile)} className="space-y-4" noValidate>
          <div className="rounded-xl bg-ivory-50 p-3 text-xs text-ink-600">
            <p><span className="font-semibold text-ink-800">Sign-in email:</span> {authEmail || '—'}</p>
            <p className="mt-1"><span className="font-semibold text-ink-800">Role:</span> {profile ? ROLE_LABELS[profile.role] : '—'}</p>
            <p className="mt-1"><span className="font-semibold text-ink-800">Workspace status:</span> {profile?.active ? 'Active' : 'Inactive'}</p>
          </div>
          <TextField
            label="Display name"
            required
            error={profileForm.formState.errors.displayName?.message}
            {...profileForm.register('displayName')}
          />
          <TextField
            label="Mobile number"
            inputMode="tel"
            placeholder="98765 43210"
            hint="Used on invoices and receipts. Digits only; do not include +91 or spaces."
            error={profileForm.formState.errors.phone?.message}
            {...profileForm.register('phone')}
          />
          <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>Save changes</Button>
          </div>
        </form>
      )}

      {tab === 'password' && (
        <div className="space-y-5">
          <form onSubmit={passwordForm.handleSubmit(onChangePassword)} className="space-y-4" noValidate>
            {!hasPasswordProvider ? (
              <p className="rounded-xl border border-ink-200 bg-ivory-50 p-3 text-xs leading-relaxed text-ink-600">
                This account does not sign in with a password. If you use Google or another provider, manage the
                credential in that provider&apos;s account settings. Contact your Super Admin if you need help.
              </p>
            ) : (
              <>
                <TextField
                  label="Current password"
                  type="password"
                  autoComplete="current-password"
                  required
                  error={passwordForm.formState.errors.currentPassword?.message}
                  {...passwordForm.register('currentPassword')}
                />
                <TextField
                  label="New password"
                  type="password"
                  autoComplete="new-password"
                  required
                  hint="At least 8 characters. Use a password you do not use elsewhere."
                  error={passwordForm.formState.errors.newPassword?.message}
                  {...passwordForm.register('newPassword')}
                />
                <TextField
                  label="Confirm new password"
                  type="password"
                  autoComplete="new-password"
                  required
                  error={passwordForm.formState.errors.confirmPassword?.message}
                  {...passwordForm.register('confirmPassword')}
                />
                <p className="text-[11px] leading-relaxed text-ink-500">
                  For your security, Firebase may ask you to sign in again before changing the password. Passwords are
                  never stored in the business database.
                </p>
              </>
            )}
            <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              {hasPasswordProvider && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void onSendResetLink()}
                  disabled={!authEmail}
                >
                  Send reset link
                </Button>
              )}
              {hasPasswordProvider && (
                <Button type="submit" loading={changingPassword}>Update password</Button>
              )}
            </div>
          </form>

          <section className="rounded-xl border border-brand-200 bg-brand-50/60 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
              <div>
                <p className="text-sm font-semibold text-brand-900">Delete account</p>
                <p className="mt-1 text-xs leading-relaxed text-brand-900/80">
                  Permanently removes your Firebase sign-in. Records you created stay in the business database for audit.
                  This cannot be undone.
                </p>
              </div>
            </div>

            {profile?.role === 'super_admin' ? (
              <p className="mt-3 rounded-lg bg-white p-2.5 text-[11px] leading-relaxed text-ink-600">
                Super Admin accounts cannot be deleted here, so the workspace cannot lock itself out. Create or promote
                another Super Admin, then remove this account from the Firebase Console.
              </p>
            ) : !deleteOpen ? (
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => setDeleteOpen(true)}
                leftIcon={<Trash2 className="h-4 w-4" />}
                disabled={!hasPasswordProvider}
              >
                Delete my account
              </Button>
            ) : (
              <div className="mt-3 space-y-3">
                <TextField
                  label="Current password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                />
                <TextField
                  label="Type DELETE to confirm"
                  required
                  hint="This permanently removes your sign-in."
                  value={deleteConfirm}
                  onChange={(event) => setDeleteConfirm(event.target.value)}
                />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDeleteOpen(false)
                      setDeleteConfirm('')
                      setDeletePassword('')
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    loading={deleting}
                    disabled={!isDeleteConfirmationValid(deleteConfirm) || !deletePassword}
                    onClick={() => void onDeleteAccount()}
                  >
                    Delete permanently
                  </Button>
                </div>
              </div>
            )}

            {!hasPasswordProvider && (
              <p className="mt-2 text-[11px] leading-relaxed text-ink-600">
                This account uses another sign-in provider, so self-service deletion is unavailable.
              </p>
            )}
          </section>
        </div>
      )}

      {tab === 'email' && canManageEmail && (
        <div className="space-y-4">
          <div className="rounded-xl border border-ink-200 bg-ivory-50 p-3 text-xs leading-relaxed text-ink-600">
            <p><span className="font-semibold text-ink-800">Sign-in email:</span> {authEmail || '—'}</p>
            <p className="mt-1"><span className="font-semibold text-ink-800">Workspace email:</span> {profileEmail || '—'}</p>
            {emailNeedsSync && (
              <p className="mt-2 rounded-lg bg-white p-2 text-[11px] text-ink-600">
                These do not match yet. If you have already verified the new address, update the workspace record now.
              </p>
            )}
          </div>

          {emailPending && (
            <div className="rounded-xl border border-brand-200 bg-brand-50 p-3 text-xs leading-relaxed text-brand-900">
              <p className="font-semibold">Verification pending</p>
              <p className="mt-1">A link was sent to {emailPending}. The sign-in email does not change until the link is opened.</p>
              <ol className="mt-2 list-decimal space-y-1 pl-4">
                <li>Open the email from Firebase in the new inbox.</li>
                <li>Follow the verification link.</li>
                <li>Return here and select “Check verification status”.</li>
              </ol>
            </div>
          )}

          {emailNeedsSync && (
            <Button type="button" variant="outline" onClick={() => void onCheckIdentity()} loading={checkingIdentity}>
              <RefreshCw className="h-4 w-4" /> Check verification status
            </Button>
          )}

          <form onSubmit={emailForm.handleSubmit(onRequestEmailChange)} className="space-y-4" noValidate>
            <TextField
              label="New sign-in email"
              type="email"
              autoComplete="email"
              required
              hint="The change only takes effect after the new address is verified. Your UID and history stay the same."
              error={emailForm.formState.errors.newEmail?.message}
              {...emailForm.register('newEmail')}
            />
            <TextField
              label="Current password"
              type="password"
              autoComplete="current-password"
              required
              error={emailForm.formState.errors.currentPassword?.message}
              {...emailForm.register('currentPassword')}
            />
            <p className="text-[11px] leading-relaxed text-ink-500">
              Firebase Authentication is the source of truth for sign-in. The staff profile is updated only after the
              new address is verified. You cannot change another person&apos;s email here.
            </p>
            <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              <Button type="submit" loading={sendingEmailLink}>Send verification link</Button>
            </div>
          </form>
        </div>
      )}
    </Dialog>
  )

  async function onSendResetLink() {
    if (!authEmail) return
    try {
      await resetPassword(authEmail)
      toast.success('Reset link sent to the sign-in email.')
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    }
  }
}
