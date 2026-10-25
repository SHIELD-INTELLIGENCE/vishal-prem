import { useEffect, useRef, useState } from 'react'
import { Warehouse } from 'lucide-react'
import { toast } from 'sonner'
import type { Product } from '@/types/models'
import { enableProductStockTracking } from '@/data/productStock'
import { friendlyFirebaseError } from '@/lib/errors'
import { formatQuantity } from '@/lib/format'
import { uniqueId } from '@/lib/utils'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { TextField, TextareaField } from '@/components/ui/Field'

/**
 * Enables stock tracking on an existing product. Creating a product does not
 * imply stock; the operator must state the opening balance, and zero is a
 * valid answer. The trusted backend writes the balance and audit record.
 */
export function EnableStockTrackingDialog({
  open,
  onOpenChange,
  product,
  onEnabled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: Product
  onEnabled: () => void
}) {
  const requestId = useRef(uniqueId())
  const [openingStock, setOpeningStock] = useState('0')
  const [criticalStock, setCriticalStock] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) return
    setOpeningStock('0')
    setCriticalStock('')
    setReason('')
    setError(null)
    requestId.current = uniqueId()
  }, [open])

  const numericOpening = openingStock.trim() === '' ? Number.NaN : Number(openingStock)
  const numericCritical = criticalStock.trim() === '' ? undefined : Number(criticalStock)

  async function submit() {
    if (busy) return
    if (!Number.isFinite(numericOpening) || numericOpening < 0) {
      setError('Enter a valid opening stock. Zero is allowed.')
      return
    }
    if (numericCritical !== undefined && (!Number.isFinite(numericCritical) || numericCritical < 0)) {
      setError('Enter a valid critical level.')
      return
    }
    if (!reason.trim()) {
      setError('Explain why stock tracking is being enabled.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      const result = await enableProductStockTracking({
        requestId: requestId.current,
        productId: product.id,
        openingStock: numericOpening,
        criticalStock: numericCritical,
        reason: reason.trim(),
      })
      toast.success(
        `Stock tracking enabled for ${product.name} at ${formatQuantity(result.resultingStockQty, result.unit)}.`,
      )
      requestId.current = uniqueId()
      onEnabled()
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
      title={`Enable stock tracking — ${product.name}`}
      description="This converts the product from untracked to stock-tracked. The opening balance is recorded explicitly; it is not inferred from sales, purchases or history."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={busy}>
            Enable tracking
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-xl border border-ink-200 bg-ivory-50 px-4 py-3 text-xs leading-relaxed text-ink-600">
          <Warehouse className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
          <p>
            After enabling, this product appears in purchasing and finished-goods inventory.
            Stock then changes only through purchases, orders, production or audited adjustments.
          </p>
        </div>

        <TextField
          label={`Opening stock (${product.unit})`}
          required
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={openingStock}
          onChange={(event) => {
            setOpeningStock(event.target.value)
            setError(null)
          }}
          hint="Use 0 if the product is in the catalogue but not currently in stock."
        />

        <TextField
          label={`Critical level (${product.unit}, optional)`}
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={criticalStock}
          onChange={(event) => {
            setCriticalStock(event.target.value)
            setError(null)
          }}
          hint="Low-stock warnings appear at or below this level."
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
          placeholder="Product should be stock-controlled; opening count verified…"
          hint="Stored permanently with the opening stock audit record."
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
