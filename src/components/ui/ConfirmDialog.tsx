import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Dialog } from './Dialog'
import { Button } from './Button'

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  loading,
  onConfirm,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
  onConfirm: () => void | Promise<void>
  children?: React.ReactNode
}) {
  const [busy, setBusy] = useState(false)
  const isBusy = busy || loading

  async function handleConfirm() {
    try {
      setBusy(true)
      await onConfirm()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !isBusy && onOpenChange(next)}
      size="sm"
      hideClose={isBusy}
      title={
        <span className="flex items-center gap-2">
          {destructive && (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-700">
              <AlertTriangle className="h-4 w-4" />
            </span>
          )}
          {title}
        </span>
      }
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>{cancelLabel}</Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={handleConfirm} loading={isBusy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  )
}
