import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Warehouse } from 'lucide-react'
import { toast } from 'sonner'
import type { Product } from '@/types/models'
import { adjustProductStock } from '@/data/productStock'
import { friendlyFirebaseError } from '@/lib/errors'
import { formatQuantity } from '@/lib/format'
import { uniqueId } from '@/lib/utils'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { TextField, TextareaField } from '@/components/ui/Field'

export function StockAdjustmentDialog({
  open,
  onOpenChange,
  product,
  onAdjusted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: Product
  onAdjusted: () => void
}) {
  const requestId = useRef(uniqueId())
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) return
    setDelta('')
    setReason('')
    setError(null)
    requestId.current = uniqueId()
  }, [open])

  const currentStock = product.stockQty ?? 0
  const numericDelta = delta.trim() === '' ? Number.NaN : Number(delta)
  const preview = Number.isFinite(numericDelta) ? currentStock + numericDelta : null
  const direction = numericDelta > 0 ? 'add' : numericDelta < 0 ? 'remove' : ''

  async function submit() {
    if (busy) return
    if (!Number.isFinite(numericDelta) || numericDelta === 0) {
      setError('Enter a non-zero stock adjustment quantity.')
      return
    }
    if (!reason.trim()) {
      setError('Enter a reason for the stock adjustment.')
      return
    }
    if (preview !== null && preview < 0) {
      setError(`This adjustment would make stock negative (${formatQuantity(preview, product.unit)}).`)
      return
    }

    setBusy(true)
    setError(null)
    try {
      const result = await adjustProductStock({
        requestId: requestId.current,
        productId: product.id,
        delta: numericDelta,
        reason: reason.trim(),
      })
      toast.success(
        `Stock adjusted from ${formatQuantity(result.previousStockQty, result.unit)} to ${formatQuantity(result.resultingStockQty, result.unit)}.`,
      )
      requestId.current = uniqueId()
      setDelta('')
      setReason('')
      onAdjusted()
      onOpenChange(false)
    } catch (caught) {
      setError(friendlyFirebaseError(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Adjust stock — ${product.name}`}
      description="Every adjustment is recorded with your staff account, the live previous balance, the new balance and your reason."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={busy}>
            Record adjustment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-ink-200 bg-ivory-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <Warehouse className="h-4 w-4 text-brand-600" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">Current balance</p>
              <p className="text-lg font-semibold tabular-nums text-ink-900">
                {formatQuantity(currentStock, product.unit)}
              </p>
            </div>
          </div>
          {preview !== null && preview !== currentStock && (
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-wide text-ink-400">After adjustment</p>
              <p className={`text-lg font-semibold tabular-nums ${preview < 0 ? 'text-brand-700' : 'text-sage-700'}`}>
                {formatQuantity(preview, product.unit)}
              </p>
            </div>
          )}
        </div>

        <TextField
          label={direction === 'add' ? 'Quantity to add' : direction === 'remove' ? 'Quantity to remove' : 'Signed adjustment quantity'}
          required
          type="number"
          inputMode="decimal"
          step="0.01"
          value={delta}
          onChange={(event) => {
            setDelta(event.target.value)
            setError(null)
          }}
          hint="Use a positive number to add stock and a negative number to remove it."
          leftIcon={direction === 'add'
            ? <ArrowUp className="h-3.5 w-3.5" />
            : direction === 'remove'
              ? <ArrowDown className="h-3.5 w-3.5" />
              : undefined}
          suffix={product.unit}
        />

        <TextareaField
          label="Reason"
          required
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
            setError(null)
          }}
          maxLength={500}
          placeholder="Physical count correction, wastage, purchase received, stock take…"
          hint="This is stored permanently in the adjustment record."
        />

        {error && (
          <p className="rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-sm text-brand-800" role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}
