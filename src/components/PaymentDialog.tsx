import { useEffect, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { format } from 'date-fns'
import { ArrowDownLeft, ArrowUpRight, IndianRupee } from 'lucide-react'
import { toast } from 'sonner'
import type { Booking, Order } from '@/types/models'
import { paymentFormSchema, type PaymentValues } from '@/lib/validation'
import { recordBookingPaymentSecure, recordOrderPaymentSecure } from '@/data/payments'
import { friendlyFirebaseError } from '@/lib/errors'
import { formatINR } from '@/lib/format'
import { uniqueId } from '@/lib/utils'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { SelectField, TextField, TextareaField } from '@/components/ui/Field'

export type PaymentTarget = { kind: 'order'; order: Order } | { kind: 'booking'; booking: Booking }

function localDateTime(date = new Date()): string {
  return format(date, "yyyy-MM-dd'T'HH:mm")
}

export function PaymentDialog({
  open,
  onOpenChange,
  target,
  onRecorded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: PaymentTarget
  onRecorded?: (paymentId: string) => void
}) {
  const doc = target.kind === 'order' ? target.order : target.booking
  const total = doc.totalPaise
  const paid = doc.paidPaise
  const balance = doc.balancePaise
  const defaultAmount = balance > 0 ? balance / 100 : 0

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PaymentValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      amount: defaultAmount,
      type: 'payment',
      mode: 'cash',
      reference: '',
      receivedAt: localDateTime(),
      notes: '',
    },
  })

  const type = watch('type')
  const requestId = useRef(uniqueId())

  useEffect(() => {
    if (!open) return
    requestId.current = uniqueId()
    reset({
      amount: defaultAmount,
      type: 'payment',
      mode: 'cash',
      reference: '',
      receivedAt: localDateTime(),
      notes: '',
    })
  }, [open, reset, defaultAmount])

  const maxAmount = useMemo(() => (type === 'refund' ? paid : balance), [type, paid, balance])

  async function onSubmit(values: PaymentValues) {
    const paise = Math.round(values.amount * 100)
    if (paise > maxAmount) {
      setError('amount', {
        message: values.type === 'refund'
          ? `Refund cannot exceed ${formatINR(paid)} already paid.`
          : `Payment cannot exceed ${formatINR(balance)} outstanding.`,
      })
      return
    }
    if (values.type === 'refund' && paid <= 0) {
      setError('amount', { message: 'There is no payment to refund.' })
      return
    }
    try {
      const result = target.kind === 'order'
        ? await recordOrderPaymentSecure({
            orderId: target.order.id,
            requestId: requestId.current,
            amountRupees: values.amount,
            type: values.type,
            mode: values.mode,
            reference: values.reference,
            receivedAt: values.receivedAt,
            notes: values.notes,
          })
        : await recordBookingPaymentSecure({
            bookingId: target.booking.id,
            requestId: requestId.current,
            amountRupees: values.amount,
            type: values.type,
            mode: values.mode,
            reference: values.reference,
            receivedAt: values.receivedAt,
            notes: values.notes,
          })
      toast.success(`${values.type === 'refund' ? 'Refund' : 'Payment'} recorded · ${result.receiptNumber}`)
      onRecorded?.(result.paymentId)
      onOpenChange(false)
    } catch (error) {
      const message = friendlyFirebaseError(error)
      setError('root', { message })
      toast.error(message)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !isSubmitting && onOpenChange(next)}
      title={type === 'refund' ? 'Record a refund' : 'Record a payment'}
      description={`${target.kind === 'order' ? target.order.orderNumber : target.booking.bookingNumber} · ${doc.customerName}`}
      size="sm"
      hideClose={isSubmitting}
      footer={
        <>
          <Button variant="outline" disabled={isSubmitting} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant={type === 'refund' ? 'danger' : 'primary'} loading={isSubmitting} onClick={handleSubmit(onSubmit)}>
            {type === 'refund' ? 'Record refund' : 'Record payment'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-ink-200 bg-ivory-50 p-3 text-center">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Total</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums">{formatINR(total)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Paid</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-sage-700">{formatINR(paid)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Balance</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-brand-700">{formatINR(balance)}</p>
          </div>
        </div>

        <SelectField
          label="Transaction type"
          required
          options={[
            { value: 'payment', label: 'Payment received' },
            { value: 'refund', label: 'Refund paid out' },
          ]}
          {...register('type')}
        />

        <TextField
          label="Amount (₹)"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          max={maxAmount / 100}
          required
          leftIcon={<IndianRupee className="h-4 w-4" />}
          hint={type === 'refund' ? `Maximum refund: ${formatINR(paid)}` : `Maximum payment: ${formatINR(balance)}`}
          error={errors.amount?.message}
          {...register('amount', { valueAsNumber: true })}
        />

        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Payment mode"
            required
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'upi', label: 'UPI' },
              { value: 'card', label: 'Card' },
              { value: 'bank_transfer', label: 'Bank transfer' },
              { value: 'other', label: 'Other' },
            ]}
            {...register('mode')}
          />
          <TextField
            label="Date & time"
            type="datetime-local"
            required
            error={errors.receivedAt?.message}
            {...register('receivedAt')}
          />
        </div>

        <TextField
          label={type === 'refund' ? 'Refund reference' : 'UPI / card reference'}
          placeholder={type === 'refund' ? 'Optional reference' : 'Optional transaction reference'}
          hint="Cash payments do not need a reference."
          error={errors.reference?.message}
          {...register('reference')}
        />
        <TextareaField
          label="Notes"
          placeholder="Optional notes for the cashier or accountant"
          error={errors.notes?.message}
          {...register('notes')}
        />

        {type === 'refund' && (
          <div className="flex gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 text-xs leading-relaxed text-brand-800">
            <ArrowDownLeft className="mt-0.5 h-4 w-4 shrink-0" />
            Refunds are recorded as a separate payment record. They are not processed through a payment gateway by this system.
          </div>
        )}
        {type === 'payment' && balance <= 0 && (
          <div className="flex gap-2 rounded-xl border border-gold-200 bg-gold-50 px-3 py-2.5 text-xs text-gold-900">
            <ArrowUpRight className="h-4 w-4 shrink-0" /> This document has no outstanding balance. Switch to Refund if money is being returned.
          </div>
        )}
        {errors.root?.message && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800" role="alert">{errors.root.message}</p>}
      </form>
    </Dialog>
  )
}
