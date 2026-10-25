import type { LabelTemplateSnapshot } from '@/types/models'
import { encodeCode128B } from '@/lib/labels'
import { formatDate, formatINR } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface LabelPreviewLine {
  lineId: string
  name: string
  sku: string
  barcodeValue: string
  unit?: string
  netQuantity?: string
  pricePaise?: number
  mrpPaise?: number
  batchNumber?: string
  manufacturedAt?: string
  expiryAt?: string
  addressLine?: string
  phone?: string
  quantity: number
}

function barPath(modules: string, height: number): string {
  let x = 0
  let path = ''
  while (x < modules.length) {
    if (modules[x] === '1') {
      let width = 1
      while (modules[x + width] === '1') width += 1
      path += `M${x} 0h${width}v${height}h-${width}z`
      x += width
    } else {
      x += 1
    }
  }
  return path
}

/** Renders a structurally valid Code 128B symbol. */
export function LabelBarcode({
  value,
  height = 30,
  className,
}: {
  value: string
  height?: number
  className?: string
}) {
  let modules = ''
  try {
    modules = encodeCode128B(value).modules
  } catch {
    return null
  }
  return (
    <svg
      viewBox={`0 0 ${modules.length} ${height}`}
      preserveAspectRatio="none"
      className={cn('block w-full', className)}
      style={{ height }}
      role="img"
      aria-label={`Barcode ${value}`}
      shapeRendering="crispEdges"
    >
      <rect x={0} y={0} width={modules.length} height={height} fill="#fff" />
      <path d={barPath(modules, height)} fill="#000" />
    </svg>
  )
}

function LabelCell({
  template,
  line,
}: {
  template: LabelTemplateSnapshot
  line: LabelPreviewLine
}) {
  return (
    <div
      className="label-cell overflow-hidden border border-ink-200 bg-white text-ink-950"
      style={{
        width: `${template.widthMm}mm`,
        height: `${template.heightMm}mm`,
        padding: `${template.marginMm}mm`,
      }}
    >
      <div className="flex h-full min-w-0 flex-col justify-between gap-0.5">
        <div className="min-w-0">
          {template.showName && (
            <p className="truncate text-[9px] font-bold leading-tight">{line.name}</p>
          )}
          {template.showSku && line.sku && (
            <p className="truncate text-[7px] leading-tight text-ink-600">{line.sku}</p>
          )}
          {template.showAddress && line.addressLine && (
            <p className="line-clamp-2 text-[6.5px] leading-tight text-ink-600">{line.addressLine}</p>
          )}
          {template.showPhone && line.phone && (
            <p className="text-[7px] leading-tight text-ink-600">{line.phone}</p>
          )}
        </div>
        <div className="min-w-0">
          {template.showUnit && (
            <p className="truncate text-[7px] leading-tight text-ink-600">
              {line.netQuantity || line.unit || 'Quantity not set'}
            </p>
          )}
          {template.showBatch && (
            <p className="truncate text-[6.5px] leading-tight text-ink-600">
              Batch: {line.batchNumber || 'not provided'}
            </p>
          )}
          {(template.showMfgDate || template.showExpiryDate) && (
            <p className="truncate text-[6.5px] leading-tight text-ink-600">
              {template.showMfgDate && `Mfg: ${line.manufacturedAt ? formatDate(line.manufacturedAt) : 'not provided'}`}
              {template.showMfgDate && template.showExpiryDate && ' · '}
              {template.showExpiryDate && `Exp: ${line.expiryAt ? formatDate(line.expiryAt) : 'not provided'}`}
            </p>
          )}
        </div>
        <div className="min-w-0">
          {(template.showPrice || template.showMrp) && (
            <div className="flex items-baseline justify-between gap-1 text-[8px] font-semibold leading-tight">
              {template.showPrice && line.pricePaise !== undefined && (
                <span>
                  {formatINR(line.pricePaise)}
                  {template.showUnit && line.unit ? <span className="text-[6px] font-normal text-ink-500"> / {line.unit}</span> : null}
                </span>
              )}
              {template.showMrp ? (
                line.mrpPaise !== undefined && line.mrpPaise > 0 ? (
                  <span className="text-[6.5px] font-normal text-ink-500">
                    MRP {formatINR(line.mrpPaise)}
                  </span>
                ) : (
                  <span className="text-[6.5px] font-normal text-ink-400">MRP not set</span>
                )
              ) : null}
            </div>
          )}
          {template.barcodeFormat === 'code128' && line.barcodeValue && (
            <LabelBarcode value={line.barcodeValue} height={24} className="mt-0.5" />
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * A printable grid of labels. Item labels are one product per cell; account
 * labels are one account per cell. The same component powers the browser
 * preview and the print sheet so what is confirmed is what was shown.
 */
export function LabelSheet({
  template,
  lines,
  className,
}: {
  template: LabelTemplateSnapshot
  lines: LabelPreviewLine[]
  className?: string
}) {
  const copies = lines.flatMap((line) =>
    Array.from({ length: Math.max(0, Math.floor(line.quantity)) }, (_, index) => ({
      ...line,
      copy: index + 1,
    })),
  )

  if (copies.length === 0) {
    return (
      <div className={cn('rounded-xl border border-dashed border-ink-300 bg-ivory-50 p-8 text-center text-sm text-ink-500', className)}>
        Nothing selected yet. Choose products or accounts and a quantity.
      </div>
    )
  }

  return (
    <div
      className={cn('label-sheet', className)}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${template.columns}, ${template.widthMm}mm)`,
        gap: '2mm',
        justifyContent: 'start',
      }}
    >
      {copies.map((line) => (
        <LabelCell key={`${line.lineId}-${line.copy}`} template={template} line={line} />
      ))}
    </div>
  )
}
