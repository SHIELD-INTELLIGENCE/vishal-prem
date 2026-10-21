import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  AlertTriangle,
  Ban,
  Check,
  Copy,
  Edit3,
  KeyRound,
  MailPlus,
  ShieldCheck,
  Trash2,
  UserPlus,
  UsersRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import {
  hasPermission,
  defaultPermissionsForRole,
  isSuperAdmin,
  PERMISSIONS,
  ROLES,
  ROLE_LABELS,
  roleDefinition,
} from '@/auth/permissions'
import { useCollectionData } from '@/data/hooks'
import { invitesQuery, usersQuery } from '@/data/queries'
import { createInvite, inviteStatus, removeStaffAccount, revokeInvite, sendStaffPasswordReset, updateStaff } from '@/data/users'
import { countOtherActiveSuperAdmins } from '@/data/staffRemoval'
import { inviteSchema, type InviteValues } from '@/lib/validation'
import { isDeleteConfirmationValid } from '@/features/account/deleteAccount'
import { SHIELD_SUPPORT_EMAIL, SHIELD_SUPPORT_PHONE } from '@/lib/support'
import type { Invite, PermissionKey, RoleCode, UserProfile } from '@/types/models'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { DataTable, type DataColumn } from '@/components/ui/DataTable'
import { Dialog } from '@/components/ui/Dialog'
import { CheckboxField, SelectField, TextField, ToggleField } from '@/components/ui/Field'
import { Tabs } from '@/components/ui/Tabs'
import { ErrorState, Skeleton } from '@/components/ui/States'
import { formatDateTime, initials } from '@/lib/format'
import { friendlyFirebaseError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import {
  enabledPermissionCount,
  hasPermissionData,
  idList,
  isDeletedStaff,
  isDepartmentAdminRole,
  isKnownRole,
  permissionSummary,
  staffDisplayName,
  staffEmail,
  staffRoleLabel,
} from './staffView'

function PermissionEditor({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, boolean>
  onChange: (key: PermissionKey, checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-4">
      {Array.from(new Set(PERMISSIONS.map((permission) => permission.group))).map((group) => (
        <div key={group}>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">{group}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {PERMISSIONS.filter((permission) => permission.group === group).map((permission) => (
              <CheckboxField
                key={permission.key}
                label={permission.label}
                description={permission.description}
                checked={value[permission.key] === true}
                disabled={disabled}
                onChange={(event) => onChange(permission.key, event.target.checked)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function UsersPage() {
  const { profile } = useAuth()
  const { outlets, departments } = useWorkspace()
  const [tab, setTab] = useState('staff')
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editing, setEditing] = useState<UserProfile | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [sendingReset, setSendingReset] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deletingStaff, setDeletingStaff] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [removedNotice, setRemovedNotice] = useState<{ name: string; email: string; uid: string } | null>(null)

  const canManageInvites = isSuperAdmin(profile)

  const users = useCollectionData<UserProfile>(() => usersQuery(), [])
  const invites = useCollectionData<Invite>(
    () => (canManageInvites ? invitesQuery() : null),
    [canManageInvites],
    canManageInvites,
  )

  const inviteForm = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: '',
      displayName: '',
      role: 'cake_admin',
      outletIds: outlets.map((outlet) => outlet.id),
      departmentIds: departments.filter((department) => department.code === 'cake').map((department) => department.id),
      permissions: defaultPermissionsForRole('cake_admin'),
      expiresInDays: 7,
    },
  })

  const editForm = useForm<{
    displayName: string
    phone: string
    role: RoleCode
    outletIds: string[]
    departmentIds: string[]
    permissions: Record<string, boolean>
    active: boolean
  }>({
    defaultValues: {
      displayName: '',
      phone: '',
      role: 'manager',
      outletIds: [],
      departmentIds: [],
      permissions: {},
      active: true,
    },
  })

  const inviteRole = inviteForm.watch('role')
  const invitePermissions = inviteForm.watch('permissions')
  const inviteOutlets = inviteForm.watch('outletIds')
  const inviteDepartments = inviteForm.watch('departmentIds')

  const editRole = editForm.watch('role')
  const editPermissions = editForm.watch('permissions')
  const editOutlets = editForm.watch('outletIds')
  const editDepartments = editForm.watch('departmentIds')

  useEffect(() => {
    if (!inviteOpen) return
    inviteForm.reset({
      email: '',
      displayName: '',
      role: 'cake_admin',
      outletIds: outlets.map((outlet) => outlet.id),
      departmentIds: departments.filter((department) => department.code === 'cake').map((department) => department.id),
      permissions: defaultPermissionsForRole('cake_admin'),
      expiresInDays: 7,
    })
    setInviteLink(null)
    setSubmitError(null)
  }, [inviteOpen, outlets, departments, inviteForm])

  useEffect(() => {
    if (!editing) return
    editForm.reset({
      displayName: staffDisplayName(editing),
      phone: typeof editing.phone === 'string' ? editing.phone : '',
      role: isKnownRole(editing.role) ? editing.role : 'manager',
      outletIds: idList(editing, 'outletIds'),
      departmentIds: idList(editing, 'departmentIds'),
      permissions: hasPermissionData(editing) ? { ...(editing.permissions as Record<string, boolean>) } : {},
      active: Boolean(editing.active),
    })
    setSubmitError(null)
    setDeleteOpen(false)
    setDeleteConfirm('')
    setDeleteError(null)
  }, [editing, editForm])

  // Deleted staff are kept in Firestore as tombstones for audit attribution and
  // must not appear as active staff. The server marks them; the client filters.
  const visibleUsers = useMemo(() => users.rows.filter((user) => !isDeletedStaff(user)), [users.rows])

  const staffSummary = useMemo(() => ({
    active: visibleUsers.filter((user) => user.active).length,
    admins: visibleUsers.filter((user) => isDepartmentAdminRole(user.role)).length,
    suspended: visibleUsers.filter((user) => !user.active).length,
    pendingInvites: invites.rows.filter((invite) => inviteStatus(invite) === 'pending').length,
  }), [visibleUsers, invites.rows])

  // Tombstoned profiles stay in Firestore for audit attribution and for the
  // later Firebase Authentication cleanup. They are never shown as active staff.
  const removedUsers = useMemo(
    () =>
      users.rows
        .filter((user) => isDeletedStaff(user))
        .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? '')),
    [users.rows],
  )

  // A Super Admin removing a target must leave at least one other active Super
  // Admin behind. Counted from stored rows, never from client claims.
  const otherActiveSuperAdmins = useMemo(
    () => (editing ? countOtherActiveSuperAdmins(users.rows, editing.uid) : 0),
    [users.rows, editing],
  )
  const editingIsLastActiveSuperAdmin = Boolean(
    editing && editing.role === 'super_admin' && editing.active && otherActiveSuperAdmins === 0,
  )

  if (!hasPermission(profile, 'usersManage')) {
    return <ErrorState title="You cannot manage staff" message="Your role does not include the Manage staff & permissions permission." />
  }

  function applyInviteRole(role: RoleCode) {
    inviteForm.setValue('role', role, { shouldDirty: true })
    inviteForm.setValue('permissions', defaultPermissionsForRole(role), { shouldDirty: true })
    const departmentCode = roleDefinition(role).departmentCode
    if (departmentCode) {
      const match = departments.filter((department) => department.code === departmentCode).map((department) => department.id)
      if (match.length > 0) inviteForm.setValue('departmentIds', match, { shouldDirty: true })
    }
  }

  async function submitInvite(values: InviteValues) {
    if (!profile) return
    setSubmitError(null)
    try {
      const result = await createInvite({ values, profile })
      setInviteLink(result.link)
      toast.success('Invitation created')
    } catch (error) {
      const message = friendlyFirebaseError(error)
      setSubmitError(message)
      toast.error(message)
    }
  }

  async function submitEdit(values: {
    displayName: string
    phone: string
    role: RoleCode
    outletIds: string[]
    departmentIds: string[]
    permissions: Record<string, boolean>
    active: boolean
  }) {
    if (!profile || !editing) return
    setSubmitError(null)
    if (editing.uid === profile.uid && (!values.active || values.role !== 'super_admin')) {
      setSubmitError('You cannot remove your own Super Admin access or deactivate your own account.')
      return
    }
    try {
      await updateStaff(
        editing.uid,
        {
          displayName: values.displayName.trim(),
          phone: values.phone.trim(),
          role: values.role,
          outletIds: values.outletIds,
          departmentIds: values.departmentIds,
          permissions: values.permissions as UserProfile['permissions'],
          active: values.active,
        },
        profile,
      )
      toast.success('Staff profile updated')
      setEditing(null)
    } catch (error) {
      const message = friendlyFirebaseError(error)
      setSubmitError(message)
      toast.error(message)
    }
  }

  async function sendResetFor(user: UserProfile) {
    try {
      setSendingReset(true)
      await sendStaffPasswordReset(staffEmail(user))
      toast.success(`Password reset email sent to ${staffEmail(user)}`)
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    } finally {
      setSendingReset(false)
    }
  }

  async function confirmRemoveStaff(target: UserProfile) {
    if (!profile) return
    if (!isDeleteConfirmationValid(deleteConfirm)) {
      setDeleteError('Type DELETE to confirm.')
      return
    }
    const targetEmail = typeof target.email === 'string' ? target.email.trim() : ''
    if (!targetEmail) {
      setDeleteError('This staff profile has no email on file. Add an email before removing the account.')
      return
    }
    setDeleteError(null)
    try {
      setDeletingStaff(true)
      const result = await removeStaffAccount({
        actor: profile,
        target,
        confirmEmail: targetEmail,
        otherActiveSuperAdmins: countOtherActiveSuperAdmins(users.rows, target.uid),
      })
      setRemovedNotice({
        name: result.displayName ?? staffDisplayName(target),
        email: result.email ?? targetEmail,
        uid: result.uid,
      })
      toast.success(`${result.displayName ?? staffDisplayName(target)} can no longer sign in. Workspace access is revoked.`)
      setEditing(null)
      setDeleteOpen(false)
      setDeleteConfirm('')
      // Refresh only after Firestore confirmed both writes.
      users.reload()
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'The staff account could not be removed. Try again.'
      setDeleteError(message)
      toast.error(message)
    } finally {
      setDeletingStaff(false)
    }
  }

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Invitation link copied')
    } catch {
      toast.error('Could not copy automatically. Select the link and copy it manually.')
    }
  }

  const staffColumns: DataColumn<UserProfile>[] = [
    {
      key: 'name',
      header: 'Staff',
      accessor: (user) => staffDisplayName(user),
      sortable: true,
      render: (user) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{initials(staffDisplayName(user))}</span>
          <div>
            <p className="font-semibold text-ink-900">{staffDisplayName(user)}{user.uid === profile?.uid ? ' (you)' : ''}</p>
            <p className="text-[11px] text-ink-500">{staffEmail(user)}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      accessor: (user) => staffRoleLabel(user.role),
      sortable: true,
      render: (user) => <Badge tone={user.role === 'super_admin' ? 'brand' : 'neutral'}>{staffRoleLabel(user.role)}</Badge>,
    },
    {
      key: 'scope',
      header: 'Scope',
      accessor: (user) => idList(user, 'outletIds').length,
      hideBelow: 'lg',
      render: (user) => {
        const outletCount = idList(user, 'outletIds').length
        const departmentCount = idList(user, 'departmentIds').length
        return (
          <div className="text-[11px] text-ink-600">
            <p>{outletCount} outlet{outletCount === 1 ? '' : 's'}</p>
            <p>{departmentCount} department{departmentCount === 1 ? '' : 's'}</p>
          </div>
        )
      },
    },
    {
      key: 'permissions',
      header: 'Permissions',
      accessor: (user) => enabledPermissionCount(user),
      hideBelow: 'md',
      render: (user) => (
        <span className={cn('text-xs', hasPermissionData(user) || user.role === 'super_admin' ? 'text-ink-600' : 'text-ink-400')}>
          {permissionSummary(user)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (user) => (user.active ? 'Active' : 'Suspended'),
      render: (user) => <Badge tone={user.active ? 'success' : 'danger'}>{user.active ? 'Active' : 'Suspended'}</Badge>,
    },
    {
      key: 'lastLogin',
      header: 'Last login',
      accessor: (user) => user.lastLoginAt ?? '',
      hideBelow: 'xl',
      render: (user) => <span className="text-[11px] text-ink-500">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (user) => (
        <Button size="sm" variant="ghost" onClick={() => setEditing(user)} leftIcon={<Edit3 className="h-3.5 w-3.5" />}>Edit</Button>
      ),
    },
  ]

  const pendingInvites = invites.rows.filter((invite) => inviteStatus(invite) === 'pending')

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Staff & permissions"
        description="Invite staff, scope them to outlets and departments, and control each permission. Roles are templates; permission overrides are stored per person."
        help="staff"
        actions={canManageInvites ? (
          <Button onClick={() => setInviteOpen(true)} leftIcon={<UserPlus className="h-4 w-4" />}>Invite staff</Button>
        ) : undefined}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Active staff', value: staffSummary.active.toString() },
          { label: 'Department admins', value: staffSummary.admins.toString() },
          { label: 'Suspended', value: staffSummary.suspended.toString() },
          ...(canManageInvites
            ? [{ label: 'Pending invites', value: staffSummary.pendingInvites.toString() }]
            : []),
        ].map((item) => (
          <div key={item.label} className="surface-card px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-400">{item.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-ink-900">{item.value}</p>
          </div>
        ))}
      </div>

      <Tabs
        tabs={[
          { id: 'staff', label: 'Staff', icon: <UsersRound className="h-4 w-4" />, badge: <Badge tone="neutral">{visibleUsers.length}</Badge> },
          ...(canManageInvites
            ? [{ id: 'invites', label: 'Invitations', icon: <MailPlus className="h-4 w-4" />, badge: pendingInvites.length ? <Badge tone="warning">{pendingInvites.length}</Badge> : undefined }]
            : []),
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'staff' && (
        <>
          {removedNotice && (
            <section className="rounded-xl border border-sage-200 bg-sage-50 p-4" role="status">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-sage-900">
                    <Check className="h-4 w-4 shrink-0" /> Access revoked for {removedNotice.name}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-sage-900/80">
                    Their workspace access and staff profile are disabled. The Firebase Authentication sign-in record
                    still exists — ask SHIELD Intelligence to remove it in the Firebase Console:
                  </p>
                  <p className="mt-1 text-xs font-semibold text-sage-900">
                    {SHIELD_SUPPORT_EMAIL}
                    {SHIELD_SUPPORT_PHONE ? ` · ${SHIELD_SUPPORT_PHONE}` : ''}
                  </p>
                  <p className="mt-1 text-[11px] text-sage-900/70">
                    Include {removedNotice.name} · {removedNotice.email} · UID {removedNotice.uid}.
                  </p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setRemovedNotice(null)}>
                  Dismiss
                </Button>
              </div>
            </section>
          )}
          {users.error && <ErrorState message={users.error} onRetry={users.reload} />}
          <DataTable
            rows={visibleUsers}
            columns={staffColumns}
            getRowId={(user) => user.uid}
            loading={users.loading}
            error={users.error}
            onRetry={users.reload}
            searchPlaceholder="Search staff name, email or role…"
            searchFields={(user) => [staffDisplayName(user), staffEmail(user), user.phone, staffRoleLabel(user.role)]}
            emptyTitle="No staff profiles"
            emptyDescription="Invite the first staff member. The first Super Admin must be created manually in Firestore before invitations work."
            emptyAction={canManageInvites ? (
              <Button size="sm" onClick={() => setInviteOpen(true)} leftIcon={<UserPlus className="h-4 w-4" />}>Invite staff</Button>
            ) : undefined}
            mobileTitle={(user) => staffDisplayName(user)}
            mobileSubtitle={(user) => `${staffEmail(user)} · ${staffRoleLabel(user.role)}`}
            mobileMeta={(user) => {
              const outletCount = idList(user, 'outletIds').length
              return (
                <>
                  <Badge tone={user.active ? 'success' : 'danger'}>{user.active ? 'Active' : 'Suspended'}</Badge>
                  <span>{outletCount} outlet{outletCount === 1 ? '' : 's'}</span>
                </>
              )
            }}
            rowActions={(user) => (
              <Button size="sm" variant="ghost" onClick={() => setEditing(user)} aria-label={`Edit ${staffDisplayName(user)}`}><Edit3 className="h-4 w-4" /></Button>
            )}
            initialSort={{ key: 'name', direction: 'asc' }}
          />
          <section className="rounded-xl border border-gold-200 bg-gold-50 p-4 text-xs leading-relaxed text-gold-900">
            <p className="font-bold">Permission model</p>
            <p className="mt-1">The UI hides areas a user cannot access, but Firestore security rules are the actual enforcement layer. Super Admin always has full access. Staff cannot edit their own role or suspension.</p>
          </section>

          {removedUsers.length > 0 && (
            <section className="surface-card overflow-hidden">
              <div className="border-b border-ink-100 px-4 py-3.5 sm:px-5">
                <h2 className="font-display text-lg font-semibold">Removed accounts</h2>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
                  These profiles are disabled and no longer count as staff, but their Firebase Authentication sign-in
                  records remain. Ask SHIELD Intelligence ({SHIELD_SUPPORT_EMAIL}
                  {SHIELD_SUPPORT_PHONE ? ` · ${SHIELD_SUPPORT_PHONE}` : ''}) to remove them in the Firebase Console,
                  quoting the name, email and UID below.
                </p>
              </div>
              <div className="table-shell">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th>Removed</th>
                      <th>UID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {removedUsers.map((user) => (
                      <tr key={user.uid}>
                        <td>
                          <p className="font-medium">{staffDisplayName(user)}</p>
                          <p className="text-[11px] text-ink-500">{staffEmail(user)}</p>
                        </td>
                        <td className="text-xs">{user.deletedAt ? formatDateTime(user.deletedAt) : '—'}</td>
                        <td className="truncate font-mono text-[11px] text-ink-500">{user.uid}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {tab === 'invites' && (
        <section className="surface-card overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3.5 sm:px-5">
            <div>
              <h2 className="font-display text-lg font-semibold">Invitations</h2>
              <p className="text-xs text-ink-500">Single-use links. Share them privately with the intended staff member.</p>
            </div>
            {canManageInvites && (
              <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)} leftIcon={<UserPlus className="h-3.5 w-3.5" />}>New invite</Button>
            )}
          </div>
          {invites.loading ? (
            <div className="p-4"><Skeleton className="h-24 w-full" /></div>
          ) : invites.rows.length === 0 ? (
            <p className="px-5 py-8 text-sm text-ink-500">No invitations have been created.</p>
          ) : (
            <div className="table-shell">
              <table className="table-base">
                <thead><tr><th>Invitee</th><th>Role</th><th>Expires</th><th>Status</th><th>Created</th><th /></tr></thead>
                <tbody>
                  {invites.rows.map((invite) => {
                    const status = inviteStatus(invite)
                    return (
                      <tr key={invite.id}>
                        <td><p className="font-medium">{invite.displayName}</p><p className="text-[11px] text-ink-500">{invite.email}</p></td>
                        <td><Badge tone="neutral">{ROLE_LABELS[invite.role]}</Badge></td>
                        <td className="text-xs">{formatDateTime(invite.expiresAt)}</td>
                        <td><Badge tone={status === 'pending' ? 'warning' : status === 'accepted' ? 'success' : 'neutral'}>{status}</Badge></td>
                        <td className="text-xs">{formatDateTime(invite.createdAt)}</td>
                        <td className="text-right">
                          {status === 'pending' && (
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => void copyLink(`${window.location.origin}/admin/join/${invite.token}`)} leftIcon={<Copy className="h-3.5 w-3.5" />}>Copy</Button>
                              <Button size="sm" variant="ghost" onClick={() => void revokeInvite(invite).then(() => toast.success('Invitation revoked')).catch((error) => toast.error(friendlyFirebaseError(error)))} leftIcon={<Ban className="h-3.5 w-3.5" />}>Revoke</Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {canManageInvites && (
        <Dialog
          open={inviteOpen}
          onOpenChange={(next) => !inviteForm.formState.isSubmitting && setInviteOpen(next)}
          title="Invite a staff member"
        description="The invitee creates their own password from a single-use link. You control role, scope and permissions."
        size="xl"
        footer={
          inviteLink ? (
            <Button onClick={() => setInviteOpen(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" disabled={inviteForm.formState.isSubmitting} onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button loading={inviteForm.formState.isSubmitting} onClick={inviteForm.handleSubmit(submitInvite)} leftIcon={<MailPlus className="h-4 w-4" />}>Create invitation</Button>
            </>
          )
        }
      >
        {inviteLink ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-sage-200 bg-sage-50 p-4 text-sm text-sage-900">
              <p className="flex items-center gap-2 font-semibold"><Check className="h-4 w-4" /> Invitation created</p>
              <p className="mt-1 text-xs leading-relaxed">Send this single-use link privately. It expires automatically and cannot be reused after the account is created.</p>
            </div>
            <div className="rounded-xl border border-ink-200 bg-ivory-50 p-3">
              <p className="break-all font-mono text-xs">{inviteLink}</p>
            </div>
            <Button onClick={() => void copyLink(inviteLink)} leftIcon={<Copy className="h-4 w-4" />}>Copy invitation link</Button>
          </div>
        ) : (
          <form onSubmit={inviteForm.handleSubmit(submitInvite)} className="space-y-5" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Staff name" required error={inviteForm.formState.errors.displayName?.message} {...inviteForm.register('displayName')} />
              <TextField label="Email address" type="email" required error={inviteForm.formState.errors.email?.message} {...inviteForm.register('email')} />
              <SelectField
                label="Role template"
                options={ROLES.map((role) => ({ value: role.code, label: role.label }))}
                error={inviteForm.formState.errors.role?.message}
                value={inviteRole}
                onChange={(event) => applyInviteRole(event.target.value as RoleCode)}
              />
              <TextField
                label="Invitation valid for (days)"
                type="number"
                min={1}
                max={30}
                required
                error={inviteForm.formState.errors.expiresInDays?.message}
                {...inviteForm.register('expiresInDays', { valueAsNumber: true })}
              />
              <p className="sm:col-span-2 rounded-lg bg-ivory-50 px-3 py-2 text-xs text-ink-500">{roleDefinition(inviteRole).description}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="field-label">Outlets</p>
                <div className="space-y-2">
                  {outlets.map((outlet) => (
                    <CheckboxField
                      key={outlet.id}
                      label={outlet.name}
                      description={outlet.code}
                      value={outlet.id}
                      checked={inviteOutlets.includes(outlet.id)}
                      onChange={(event) => {
                        const next = event.target.checked ? [...inviteOutlets, outlet.id] : inviteOutlets.filter((id) => id !== outlet.id)
                        inviteForm.setValue('outletIds', next, { shouldDirty: true })
                      }}
                    />
                  ))}
                </div>
                {inviteForm.formState.errors.outletIds?.message && <p className="field-error">{inviteForm.formState.errors.outletIds.message}</p>}
              </div>
              <div>
                <p className="field-label">Departments</p>
                <div className="space-y-2">
                  {departments.map((department) => (
                    <CheckboxField
                      key={department.id}
                      label={department.name}
                      description={department.description}
                      checked={inviteDepartments.includes(department.id)}
                      onChange={(event) => {
                        const next = event.target.checked ? [...inviteDepartments, department.id] : inviteDepartments.filter((id) => id !== department.id)
                        inviteForm.setValue('departmentIds', next, { shouldDirty: true })
                      }}
                    />
                  ))}
                </div>
                {inviteForm.formState.errors.departmentIds?.message && <p className="field-error">{inviteForm.formState.errors.departmentIds.message}</p>}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="field-label mb-0">Permissions</p>
                <Button size="sm" variant="ghost" onClick={() => inviteForm.setValue('permissions', defaultPermissionsForRole(inviteRole), { shouldDirty: true })}>Reset to role</Button>
              </div>
              <PermissionEditor
                value={invitePermissions}
                onChange={(key, checked) => inviteForm.setValue('permissions', { ...invitePermissions, [key]: checked }, { shouldDirty: true })}
              />
            </div>

            {submitError && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800" role="alert">{submitError}</p>}
            <button type="submit" className="sr-only">Create invitation</button>
          </form>
        )}
        </Dialog>
      )}

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(next) => !next && setEditing(null)}
        title={editing ? `Edit ${staffDisplayName(editing)}` : 'Edit staff'}
        description="Changes take effect immediately. Firestore rules evaluate the stored profile on every request."
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button loading={editForm.formState.isSubmitting} onClick={editForm.handleSubmit(submitEdit)} leftIcon={<Check className="h-4 w-4" />}>Save staff profile</Button>
          </>
        }
      >
        {editing && (
          <form onSubmit={editForm.handleSubmit(submitEdit)} className="space-y-5" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Display name" required error={editForm.formState.errors.displayName?.message} {...editForm.register('displayName')} />
              <TextField label="Phone" inputMode="tel" error={editForm.formState.errors.phone?.message} {...editForm.register('phone')} />
              <TextField label="Email" value={staffEmail(editing)} disabled />
              <SelectField
                label="Role"
                options={ROLES.map((role) => ({ value: role.code, label: role.label }))}
                value={editRole}
                disabled={editing.uid === profile?.uid}
                onChange={(event) => {
                  const role = event.target.value as RoleCode
                  editForm.setValue('role', role, { shouldDirty: true })
                  editForm.setValue('permissions', defaultPermissionsForRole(role), { shouldDirty: true })
                  const code = roleDefinition(role).departmentCode
                  if (code) {
                    const match = departments.filter((department) => department.code === code).map((department) => department.id)
                    if (match.length) editForm.setValue('departmentIds', match, { shouldDirty: true })
                  }
                }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 bg-ivory-50 px-3.5 py-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-ink-800">Password reset</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500">
                  Sends a Firebase reset link to {staffEmail(editing) || 'this staff member'}. They choose the new password.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                loading={sendingReset}
                disabled={!staffEmail(editing)}
                onClick={() => void sendResetFor(editing)}
                leftIcon={<MailPlus className="h-4 w-4" />}
              >
                Send reset email
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="field-label">Outlets</p>
                <div className="space-y-2">
                  {outlets.map((outlet) => (
                    <CheckboxField
                      key={outlet.id}
                      label={outlet.name}
                      description={outlet.code}
                      checked={editOutlets.includes(outlet.id)}
                      onChange={(event) => {
                        const next = event.target.checked ? [...editOutlets, outlet.id] : editOutlets.filter((id) => id !== outlet.id)
                        editForm.setValue('outletIds', next, { shouldDirty: true })
                      }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="field-label">Departments</p>
                <div className="space-y-2">
                  {departments.map((department) => (
                    <CheckboxField
                      key={department.id}
                      label={department.name}
                      description={department.code}
                      checked={editDepartments.includes(department.id)}
                      onChange={(event) => {
                        const next = event.target.checked ? [...editDepartments, department.id] : editDepartments.filter((id) => id !== department.id)
                        editForm.setValue('departmentIds', next, { shouldDirty: true })
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <ToggleField
              checked={editForm.watch('active')}
              onCheckedChange={(checked) => editForm.setValue('active', checked, { shouldDirty: true })}
              label="Account active"
              description={editing.uid === profile?.uid ? 'You cannot suspend your own account.' : 'Suspended staff cannot sign in or read data.'}
              disabled={editing.uid === profile?.uid}
            />

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="field-label mb-0">Permissions</p>
                <Button size="sm" variant="ghost" onClick={() => editForm.setValue('permissions', defaultPermissionsForRole(editRole), { shouldDirty: true })}>Reset to role</Button>
              </div>
              <PermissionEditor value={editPermissions} onChange={(key, checked) => editForm.setValue('permissions', { ...editPermissions, [key]: checked }, { shouldDirty: true })} />
            </div>

            {submitError && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800" role="alert">{submitError}</p>}
            <p className="flex gap-1.5 text-[11px] text-ink-400"><KeyRound className="mt-0.5 h-3 w-3 shrink-0" /> Password resets are handled by Firebase Authentication&apos;s email flow, not stored here.</p>

            {profile?.role === 'super_admin' && editing.uid !== profile.uid && (
              <section className="rounded-xl border border-brand-200 bg-brand-50/60 p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-brand-900">Revoke access &amp; remove staff profile</p>
                    <p className="mt-1 text-xs leading-relaxed text-brand-900/80">
                      Suspending only blocks sign-in and can be reversed. Removing revokes{' '}
                      <span className="font-semibold">{staffDisplayName(editing)}</span>&apos;s workspace access
                      immediately and disables this staff profile. It cannot be undone from the app. It does{' '}
                      <span className="font-semibold">not</span> delete the Firebase Authentication sign-in record —
                      that step is handled by SHIELD Intelligence.
                    </p>
                  </div>
                </div>

                {editingIsLastActiveSuperAdmin ? (
                  <div
                    className="mt-3 rounded-lg border border-brand-200 bg-white/70 px-3 py-2 text-xs leading-relaxed text-brand-900/80"
                    role="alert"
                  >
                    This is the last active Super Admin. Promote or activate another Super Admin before removing this
                    account, otherwise nobody can manage staff.
                  </div>
                ) : !deleteOpen ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => { setDeleteError(null); setDeleteOpen(true) }}
                      leftIcon={<Trash2 className="h-4 w-4" />}
                    >
                      Revoke access &amp; remove…
                    </Button>
                    <span className="text-[11px] text-brand-900/70">
                      For a temporary block, turn off “Account active” above instead.
                    </span>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <dl className="grid gap-1 rounded-lg border border-brand-200 bg-white/70 px-3 py-2 text-xs">
                      <div className="flex justify-between gap-3">
                        <dt className="text-ink-500">Staff</dt>
                        <dd className="font-semibold text-ink-900">{staffDisplayName(editing)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-ink-500">Email</dt>
                        <dd className="truncate font-mono text-[11px] text-ink-800">{staffEmail(editing)}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-ink-500">UID</dt>
                        <dd className="truncate font-mono text-[11px] text-ink-800">{editing.uid}</dd>
                      </div>
                    </dl>

                    <div className="rounded-lg border border-brand-200 bg-white/70 px-3 py-2 text-[11px] leading-relaxed text-brand-900/80">
                      <p className="font-semibold">What this changes</p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4">
                        <li>Workspace access is revoked immediately; the security rules stop trusting this profile.</li>
                        <li>The Firestore staff profile is disabled and reduced to a deleted record.</li>
                        <li>
                          The Firebase Authentication sign-in record still exists and is{' '}
                          <span className="font-semibold">not</span> removed here. Request its removal from SHIELD
                          Intelligence (Firebase Console).
                        </li>
                        <li>Orders, bookings, payments and audit attribution are unchanged. Pending invitations are untouched.</li>
                      </ul>
                    </div>

                    <TextField
                      label="Type DELETE to confirm"
                      required
                      hint={`Removing ${staffDisplayName(editing)} · ${staffEmail(editing)} · UID: ${editing.uid}`}
                      value={deleteConfirm}
                      disabled={deletingStaff}
                      onChange={(event) => setDeleteConfirm(event.target.value)}
                      onKeyDown={(event) => {
                        // This field sits inside the edit form; Enter must not save the profile.
                        if (event.key === 'Enter') event.preventDefault()
                      }}
                    />

                    {deleteError && (
                      <p className="rounded-lg border border-brand-200 bg-white px-3 py-2 text-xs leading-relaxed text-brand-800" role="alert">
                        {deleteError}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={deletingStaff}
                        onClick={() => { setDeleteOpen(false); setDeleteConfirm(''); setDeleteError(null) }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        loading={deletingStaff}
                        disabled={!isDeleteConfirmationValid(deleteConfirm)}
                        onClick={() => void confirmRemoveStaff(editing)}
                        leftIcon={<Trash2 className="h-4 w-4" />}
                      >
                        Revoke access &amp; remove profile
                      </Button>
                    </div>

                    <p className="text-[11px] leading-relaxed text-brand-900/70">
                      If a partial failure is reported, access has already been revoked. Retry; it is safe to repeat.
                    </p>
                  </div>
                )}
              </section>
            )}

            <button type="submit" className="sr-only">Save staff profile</button>
          </form>
        )}
      </Dialog>

      <p className="flex items-center gap-1.5 text-[11px] text-ink-400"><ShieldCheck className="h-3 w-3" /> Staff changes are logged by updatedBy/updatedAt on the profile document.</p>
    </div>
  )
}
