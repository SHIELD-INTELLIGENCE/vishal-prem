import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, ChefHat, Edit3, Palette, Plus, Store, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission } from '@/auth/permissions'
import { deleteDepartment, getDepartmentUsage, saveDepartment, type DepartmentUsage } from '@/data/admin'
import { departmentSchema, type DepartmentValues } from '@/lib/validation'
import type { Department } from '@/types/models'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button, IconButton } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Dialog } from '@/components/ui/Dialog'
import { CheckboxField, TextField, TextareaField, ToggleField } from '@/components/ui/Field'
import { ErrorState } from '@/components/ui/States'
import { formatDateTime } from '@/lib/format'
import { friendlyFirebaseError } from '@/lib/errors'
import { isDeleteConfirmationValid } from '@/features/account/deleteAccount'

export function DepartmentsPage() {
  const { profile } = useAuth()
  const { outlets, departments } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Department | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Department | null>(null)
  const [usage, setUsage] = useState<DepartmentUsage | null>(null)
  const [usageError, setUsageError] = useState<string | null>(null)
  const [checkingUsage, setCheckingUsage] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const isSuper = profile?.role === 'super_admin'

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DepartmentValues>({
    resolver: zodResolver(departmentSchema),
    defaultValues: { name: '', code: '', description: '', outletIds: [], color: '#C8102E', active: true },
  })

  useEffect(() => {
    if (!open) return
    setSubmitError(null)
    reset(
      editing
        ? {
            name: editing.name,
            code: editing.code,
            description: editing.description ?? '',
            outletIds: editing.outletIds,
            color: editing.color,
            active: editing.active,
          }
        : {
            name: '',
            code: '',
            description: '',
            outletIds: outlets.map((outlet) => outlet.id),
            color: '#C8102E',
            active: true,
          },
    )
  }, [open, editing, reset, outlets])

  useEffect(() => {
    if (!deleting) return
    let cancelled = false
    setUsage(null)
    setUsageError(null)
    setDeleteConfirm('')
    setCheckingUsage(true)
    getDepartmentUsage(deleting.id)
      .then((result) => { if (!cancelled) setUsage(result) })
      .catch((error) => { if (!cancelled) setUsageError(friendlyFirebaseError(error)) })
      .finally(() => { if (!cancelled) setCheckingUsage(false) })
    return () => { cancelled = true }
  }, [deleting])

  if (!hasPermission(profile, 'departmentsManage')) {
    return <ErrorState title="You cannot manage departments" message="Your role does not include the Manage departments permission." />
  }

  async function onSubmit(values: DepartmentValues) {
    if (!profile) return
    setSubmitError(null)
    try {
      await saveDepartment({ values, existing: editing, profile })
      toast.success(editing ? 'Department updated' : 'Department created')
      setOpen(false)
      setEditing(null)
    } catch (error) {
      const message = friendlyFirebaseError(error)
      setSubmitError(message)
      toast.error(message)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    setUsageError(null)
    try {
      await deleteDepartment(deleting.id)
      toast.success(`${deleting.name} deleted`)
      setDeleting(null)
    } catch (error) {
      const message = friendlyFirebaseError(error)
      setUsageError(message)
      toast.error(message)
    } finally {
      setDeleteBusy(false)
    }
  }

  async function deactivateInstead(department: Department) {
    if (!profile) return
    try {
      await saveDepartment({
        values: {
          name: department.name,
          code: department.code,
          description: department.description ?? '',
          outletIds: department.outletIds,
          color: department.color,
          active: false,
        },
        existing: department,
        profile,
      })
      toast.success(`${department.name} deactivated`)
      setDeleting(null)
    } catch (error) {
      toast.error(friendlyFirebaseError(error))
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Catalogue"
        title="Departments"
        description="Cake, Sweets, Hot Section and Gajak operate as separate departments. Department admins only see their assigned areas."
        help="department-admin"
        actions={
          <Button
            onClick={() => { setEditing(null); setOpen(true) }}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            New department
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        {departments.map((department) => (
          <section key={department.id} className="surface-card overflow-hidden">
            <div className="h-1.5 w-full" style={{ backgroundColor: department.color }} />
            <div className="flex items-start justify-between gap-3 px-4 py-4 sm:px-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl text-white" style={{ backgroundColor: department.color }}>
                  <ChefHat className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-semibold">{department.name}</h2>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{department.code}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={department.active ? 'success' : 'neutral'}>{department.active ? 'Active' : 'Inactive'}</Badge>
                <Button size="sm" variant="outline" onClick={() => { setEditing(department); setOpen(true) }} leftIcon={<Edit3 className="h-3.5 w-3.5" />}>Edit</Button>
                {isSuper && (
                  <IconButton
                    label={`Delete ${department.name}`}
                    className="text-ink-400 hover:bg-brand-50 hover:text-brand-700"
                    onClick={() => setDeleting(department)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                )}
              </div>
            </div>
            <p className="px-4 pb-3 text-sm text-ink-600 sm:px-5">{department.description || 'No description.'}</p>
            <div className="border-t border-ink-100 bg-ivory-50/60 px-4 py-3 sm:px-5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Outlets</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {department.outletIds.map((id) => {
                  const outlet = outlets.find((item) => item.id === id)
                  return outlet ? <Badge key={id} tone="neutral"><Store className="mr-1 h-3 w-3" />{outlet.name}</Badge> : null
                })}
                {department.outletIds.length === 0 && <span className="text-xs text-ink-400">No outlet assigned</span>}
              </div>
              <p className="mt-2 text-[10px] text-ink-400">Updated {formatDateTime(department.updatedAt)}</p>
            </div>
          </section>
        ))}
      </div>

      <section className="rounded-xl border border-gold-200 bg-gold-50 p-4 text-xs leading-relaxed text-gold-900">
        <p className="font-bold">Changing a department code</p>
        <p className="mt-1">The code is used for role defaults (cake, sweets, hot, gajak). Renaming a code can affect those defaults. Existing products keep their department ID.</p>
      </section>

      <Dialog
        open={open}
        onOpenChange={(next) => !isSubmitting && setOpen(next)}
        title={editing ? `Edit ${editing.name}` : 'New department'}
        description="Department admins are assigned at staff level. Outlet assignment controls where this department operates."
        size="md"
        footer={
          <>
            <Button variant="outline" disabled={isSubmitting} onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={isSubmitting} onClick={handleSubmit(onSubmit)}>{editing ? 'Save department' : 'Create department'}</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Department name" required placeholder="Cake" error={errors.name?.message} {...register('name')} />
            <TextField label="Code" required placeholder="cake" hint="Lowercase letters, numbers and hyphens." error={errors.code?.message} {...register('code')} />
            <TextField label="Colour" type="color" className="h-10 w-full cursor-pointer p-1" error={errors.color?.message} {...register('color')} />
            <div className="flex items-end">
              <ToggleField
                checked={watch('active')}
                onCheckedChange={(checked) => setValue('active', checked, { shouldDirty: true })}
                label="Active department"
                description="Inactive departments are hidden from new work."
              />
            </div>
          </div>
          <TextareaField label="Description" maxLength={240} placeholder="What this department produces and sells." error={errors.description?.message} {...register('description')} />
          <div>
            <p className="field-label">Available at outlets</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {outlets.map((outlet) => (
                <CheckboxField key={outlet.id} label={outlet.name} description={outlet.code} value={outlet.id} {...register('outletIds')} />
              ))}
            </div>
            {errors.outletIds?.message && <p className="field-error" role="alert">{errors.outletIds.message}</p>}
          </div>
          <p className="flex gap-1.5 text-[11px] text-ink-400"><Palette className="mt-0.5 h-3 w-3 shrink-0" /> Colour is used in dashboard charts and department labels.</p>
          {submitError && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800" role="alert">{submitError}</p>}
          <button type="submit" className="sr-only">Save department</button>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(next) => { if (!next && !deleteBusy) setDeleting(null) }}
        title={deleting ? `Delete ${deleting.name}?` : 'Delete department'}
        description="Deleting a department is permanent. Departments that are still in use are protected."
        size="md"
        footer={
          <>
            <Button variant="outline" disabled={deleteBusy} onClick={() => setDeleting(null)}>Cancel</Button>
            {usage && usage.total > 0 ? (
              <Button variant="secondary" disabled={deleteBusy} onClick={() => deleting && void deactivateInstead(deleting)}>
                Deactivate instead
              </Button>
            ) : (
              <Button
                variant="danger"
                loading={deleteBusy}
                disabled={checkingUsage || !usage || usage.total > 0 || !isDeleteConfirmationValid(deleteConfirm)}
                onClick={() => void confirmDelete()}
                leftIcon={<Trash2 className="h-4 w-4" />}
              >
                Delete permanently
              </Button>
            )}
          </>
        }
      >
        {deleting && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50/60 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
              <p className="text-xs leading-relaxed text-brand-900/80">
                This removes <span className="font-semibold">{deleting.name}</span> from the catalogue and every
                department menu. It cannot be undone.
              </p>
            </div>

            {checkingUsage && (
              <p className="text-xs text-ink-500">Checking linked products, orders and bookings…</p>
            )}

            {usageError && (
              <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800" role="alert">{usageError}</p>
            )}

            {usage && usage.total > 0 && (
              <div className="space-y-2 rounded-xl border border-gold-200 bg-gold-50 p-3 text-xs leading-relaxed text-gold-900">
                <p className="font-semibold">This department is still in use.</p>
                <ul className="list-disc space-y-1 pl-4">
                  {usage.products > 0 && <li>{usage.products} product{usage.products === 1 ? '' : 's'}</li>}
                  {usage.orders > 0 && <li>{usage.orders} order{usage.orders === 1 ? '' : 's'}</li>}
                  {usage.bookings > 0 && <li>{usage.bookings} booking{usage.bookings === 1 ? '' : 's'}</li>}
                </ul>
                <p>Reassign those records first, or deactivate the department to hide it from new work without breaking history.</p>
              </div>
            )}

            {usage && usage.total === 0 && (
              <>
                <p className="text-xs leading-relaxed text-ink-600">
                  No products, orders or bookings reference this department. It is safe to remove.
                </p>
                <TextField
                  label="Type DELETE to confirm"
                  required
                  value={deleteConfirm}
                  onChange={(event) => setDeleteConfirm(event.target.value)}
                />
              </>
            )}
          </div>
        )}
      </Dialog>
    </div>
  )
}
