import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Building2, Edit3, Mail, MapPin, Phone, Plus, Store } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { useWorkspace } from '@/auth/WorkspaceProvider'
import { hasPermission } from '@/auth/permissions'
import { saveOutlet } from '@/data/admin'
import { outletSchema, type OutletValues } from '@/lib/validation'
import type { Outlet } from '@/types/models'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Dialog } from '@/components/ui/Dialog'
import { TextField, ToggleField } from '@/components/ui/Field'
import { ErrorState } from '@/components/ui/States'
import { formatDateTime } from '@/lib/format'
import { friendlyFirebaseError } from '@/lib/errors'

const EMPTY: OutletValues = {
  name: '',
  code: '',
  phone: '',
  email: '',
  address: '',
  gstin: '',
  active: true,
}

export function OutletsPage() {
  const { profile } = useAuth()
  const { outlets, departments, business } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Outlet | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<OutletValues>({ resolver: zodResolver(outletSchema), defaultValues: EMPTY })

  useEffect(() => {
    if (!open) return
    setSubmitError(null)
    reset(
      editing
        ? {
            name: editing.name,
            code: editing.code,
            phone: editing.phone,
            email: editing.email ?? '',
            address: editing.address,
            gstin: editing.gstin ?? '',
            active: editing.active,
          }
        : EMPTY,
    )
  }, [open, editing, reset])

  if (!hasPermission(profile, 'outletsManage')) {
    return <ErrorState title="You cannot manage outlets" message="Your role does not include the Manage outlets permission." />
  }

  function openCreate() {
    setEditing(null)
    setOpen(true)
  }

  function openEdit(outlet: Outlet) {
    setEditing(outlet)
    setOpen(true)
  }

  async function onSubmit(values: OutletValues) {
    if (!profile) return
    setSubmitError(null)
    try {
      await saveOutlet({ values, existing: editing, profile })
      toast.success(editing ? 'Outlet updated' : 'Outlet created')
      setOpen(false)
      setEditing(null)
    } catch (error) {
      const message = friendlyFirebaseError(error)
      setSubmitError(message)
      toast.error(message)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administration"
        title="Outlets"
        description="Both physical locations. Orders, product availability, customer accounts and staff access are scoped to outlets."
        help="outlet-admin"
        actions={<Button onClick={openCreate} leftIcon={<Plus className="h-4 w-4" />}>New outlet</Button>}
      />

      <div className="grid gap-4 md:grid-cols-2">
        {outlets.map((outlet) => {
          const outletDepartments = departments.filter((department) => department.outletIds.includes(outlet.id))
          return (
            <section key={outlet.id} className="surface-card overflow-hidden">
              <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-4 py-4 sm:px-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><Store className="h-5 w-5" /></div>
                  <div>
                    <h2 className="font-display text-lg font-semibold">{outlet.name}</h2>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-ink-400">{outlet.code}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={outlet.active ? 'success' : 'neutral'}>{outlet.active ? 'Active' : 'Inactive'}</Badge>
                  <Button size="sm" variant="outline" onClick={() => openEdit(outlet)} leftIcon={<Edit3 className="h-3.5 w-3.5" />}>Edit</Button>
                </div>
              </div>
              <div className="space-y-2.5 px-4 py-4 text-sm text-ink-600 sm:px-5">
                <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" /> {outlet.address}</p>
                <p className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0 text-ink-400" /> {outlet.phone || 'No phone'}</p>
                <p className="flex items-center gap-2"><Mail className="h-4 w-4 shrink-0 text-ink-400" /> {outlet.email || 'No email'}</p>
                <p className="flex items-center gap-2"><Building2 className="h-4 w-4 shrink-0 text-ink-400" /> {outlet.gstin || 'No GSTIN'}</p>
              </div>
              <div className="border-t border-ink-100 bg-ivory-50/60 px-4 py-3 sm:px-5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Departments at this outlet</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {outletDepartments.length === 0 ? <span className="text-xs text-ink-400">None assigned</span> : outletDepartments.map((department) => <Badge key={department.id} tone="neutral">{department.name}</Badge>)}
                </div>
                <p className="mt-2 text-[10px] text-ink-400">Updated {formatDateTime(outlet.updatedAt)}</p>
              </div>
            </section>
          )
        })}
      </div>

      {outlets.length === 0 && (
        <section className="surface-card">
          <ErrorState title="No outlets" message="The workspace has no outlets yet. Run first-time setup or create one here." />
        </section>
      )}

      <section className="rounded-xl border border-gold-200 bg-gold-50 p-4 text-xs leading-relaxed text-gold-900">
        <p className="font-bold">Outlets are not deleted</p>
        <p className="mt-1">Deactivate an outlet instead. Deleting would orphan historical orders, bookings and payments. Changing an outlet code does not rewrite existing order numbers.</p>
      </section>

      <Dialog
        open={open}
        onOpenChange={(next) => !isSubmitting && setOpen(next)}
        title={editing ? `Edit ${editing.name}` : 'New outlet'}
        description="The code is used in order, booking and receipt numbers. It is stored in uppercase."
        size="md"
        footer={
          <>
            <Button variant="outline" disabled={isSubmitting} onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={isSubmitting} onClick={handleSubmit(onSubmit)}>{editing ? 'Save outlet' : 'Create outlet'}</Button>
          </>
        }
      >
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2" noValidate>
          <TextField label="Outlet name" required error={errors.name?.message} {...register('name')} />
          <TextField label="Short code" required maxLength={10} placeholder="VP1" error={errors.code?.message} {...register('code')} />
          <TextField label="Phone" required inputMode="tel" maxLength={10} error={errors.phone?.message} {...register('phone')} />
          <TextField label="Email" type="email" error={errors.email?.message} {...register('email')} />
          <TextField label="Address" required containerClassName="sm:col-span-2" error={errors.address?.message} {...register('address')} />
          <TextField label="GSTIN" maxLength={15} error={errors.gstin?.message} {...register('gstin')} />
          <div className="flex items-end">
            <ToggleField
              checked={watch('active')}
              onCheckedChange={(checked) => setValue('active', checked, { shouldDirty: true })}
              label="Active outlet"
              description="Inactive outlets stay in history but are removed from new work."
            />
          </div>
          {submitError && <p className="sm:col-span-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800" role="alert">{submitError}</p>}
          {business && <p className="sm:col-span-2 text-[11px] text-ink-400">Business settings are shared across outlets. Edit the business profile in Settings.</p>}
          <button type="submit" className="sr-only">Save outlet</button>
        </form>
      </Dialog>
    </div>
  )
}
