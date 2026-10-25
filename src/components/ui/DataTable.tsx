import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CsvExportColumn } from '@/lib/csvExport'
import { Button, IconButton } from './Button'
import { CsvExportDialog } from './CsvExportDialog'
import { EmptyState, ErrorState, TableSkeleton } from './States'

export interface DataColumn<T> {
  key: string
  header: string
  accessor?: (row: T) => string | number | null | undefined
  render?: (row: T) => ReactNode
  sortable?: boolean
  align?: 'left' | 'right' | 'center'
  className?: string
  hideBelow?: 'md' | 'lg' | 'xl'
  csvValue?: (row: T) => string | number | null | undefined
}

export interface DataTableProps<T> {
  rows: T[]
  columns: DataColumn<T>[]
  getRowId: (row: T) => string
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  searchable?: boolean
  searchPlaceholder?: string
  searchFields?: (row: T) => Array<string | number | null | undefined>
  pageSize?: number
  pageSizeOptions?: number[]
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: ReactNode
  emptyHelp?: string
  toolbar?: ReactNode
  exportFilename?: string
  exportTitle?: string
  exportDescription?: string
  /** Date accessor for the export date range. Omit for undated tables. */
  exportDate?: (row: T) => string | null | undefined
  exportInitialFrom?: string
  exportInitialTo?: string
  onRowClick?: (row: T) => void
  rowActions?: (row: T) => ReactNode
  mobileTitle: (row: T) => ReactNode
  mobileSubtitle?: (row: T) => ReactNode
  mobileMeta?: (row: T) => ReactNode
  selectable?: boolean
  bulkActions?: (selectedRows: T[], clear: () => void) => ReactNode
  caption?: string
  initialSort?: { key: string; direction: 'asc' | 'desc' }
  density?: 'comfortable' | 'compact'
}

const hideClasses: Record<string, string> = {
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
}

function normalize(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).toLowerCase()
}

export function DataTable<T>({
  rows,
  columns,
  getRowId,
  loading,
  error,
  onRetry,
  searchable = true,
  searchPlaceholder = 'Search…',
  searchFields,
  pageSize: initialPageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  emptyTitle = 'No records yet',
  emptyDescription,
  emptyAction,
  emptyHelp,
  toolbar,
  exportFilename,
  exportTitle,
  exportDescription,
  exportDate,
  exportInitialFrom,
  exportInitialTo,
  onRowClick,
  rowActions,
  mobileTitle,
  mobileSubtitle,
  mobileMeta,
  selectable,
  bulkActions,
  caption,
  initialSort,
  density = 'comfortable',
}: DataTableProps<T>) {
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(initialSort ?? null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [exportOpen, setExportOpen] = useState(false)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return rows
    return rows.filter((row) => {
      if (searchFields) return searchFields(row).some((value) => normalize(value).includes(query))
      return columns.some((column) => normalize(column.accessor?.(row)).includes(query))
    })
  }, [rows, search, searchFields, columns])

  const sorted = useMemo(() => {
    if (!sort) return filtered
    const column = columns.find((item) => item.key === sort.key)
    if (!column?.accessor) return filtered
    const direction = sort.direction === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const aValue = column.accessor?.(a)
      const bValue = column.accessor?.(b)
      if (aValue === bValue) return 0
      if (aValue === null || aValue === undefined) return 1
      if (bValue === null || bValue === undefined) return -1
      if (typeof aValue === 'number' && typeof bValue === 'number') return (aValue - bValue) * direction
      return String(aValue).localeCompare(String(bValue), 'en-IN', { numeric: true }) * direction
    })
  }, [filtered, sort, columns])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paged = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  )

  useEffect(() => {
    setPage(1)
  }, [search, pageSize, rows.length])

  useEffect(() => {
    setSelected(new Set())
  }, [rows])

  const selectedRows = useMemo(() => rows.filter((row) => selected.has(getRowId(row))), [rows, selected, getRowId])

  function toggleAll() {
    if (selectedRows.length === paged.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(paged.map(getRowId)))
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function cycleSort(column: DataColumn<T>) {
    if (!column.sortable) return
    setSort((prev) => {
      if (!prev || prev.key !== column.key) return { key: column.key, direction: 'asc' }
      if (prev.direction === 'asc') return { key: column.key, direction: 'desc' }
      return null
    })
  }

  function handleExport() {
    if (!exportFilename) return
    setExportOpen(true)
  }

  const exportColumns: CsvExportColumn<T>[] = columns
    .filter((column) => Boolean(column.header))
    .map((column) => ({
      key: column.key,
      header: column.header,
      value: (row) => column.csvValue?.(row) ?? column.accessor?.(row) ?? '',
    }))

  const searchInput = searchable ? (
    <div className="relative min-w-56 flex-1 sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={searchPlaceholder}
        className="field-input h-9 pl-9 pr-8 text-[13px]"
        aria-label="Search records"
        data-search-input
      />
      {search && (
        <button
          type="button"
          onClick={() => setSearch('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-400 hover:text-ink-700"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  ) : null

  return (
    <div className="surface-card overflow-hidden">
      {(searchable || toolbar || exportFilename || (selectable && selectedRows.length > 0)) && (
        <div className="flex flex-col gap-2.5 border-b border-ink-100 px-3.5 py-3 sm:flex-row sm:flex-wrap sm:items-center">
          {searchInput}
          {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
          <div className="flex items-center gap-2 sm:ml-auto">
            {selectable && selectedRows.length > 0 && (
              <span className="text-xs font-semibold text-ink-600">{selectedRows.length} selected</span>
            )}
            {exportFilename && (
              <Button variant="outline" size="sm" onClick={handleExport} leftIcon={<Download className="h-3.5 w-3.5" />}>
                Export CSV
              </Button>
            )}
          </div>
        </div>
      )}

      {selectable && selectedRows.length > 0 && bulkActions && (
        <div className="flex flex-wrap items-center gap-2 border-b border-brand-100 bg-brand-50/60 px-3.5 py-2">
          {bulkActions(selectedRows, () => setSelected(new Set()))}
        </div>
      )}

      {error ? (
        <ErrorState message={error} onRetry={onRetry} help="troubleshooting" />
      ) : loading ? (
        <TableSkeleton rows={5} columns={Math.min(columns.length, 6)} />
      ) : sorted.length === 0 ? (
        <EmptyState
          title={search ? 'No matching records' : emptyTitle}
          description={search ? `Nothing matches “${search}”. Try a different search or clear the filter.` : emptyDescription}
          action={search ? <Button variant="outline" size="sm" onClick={() => setSearch('')}>Clear search</Button> : emptyAction}
          help={search ? undefined : emptyHelp}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <div className="table-shell">
              <table className="table-base">
                {caption && <caption className="sr-only">{caption}</caption>}
                <thead>
                  <tr>
                    {selectable && (
                      <th className="w-10">
                        <input
                          type="checkbox"
                          aria-label="Select all rows on this page"
                          checked={paged.length > 0 && paged.every((row) => selected.has(getRowId(row)))}
                          onChange={toggleAll}
                          className="h-4 w-4 rounded border-ink-300 accent-brand-600"
                        />
                      </th>
                    )}
                    {columns.map((column) => (
                      <th
                        key={column.key}
                        className={cn(
                          column.align === 'right' && 'text-right',
                          column.align === 'center' && 'text-center',
                          column.hideBelow && hideClasses[column.hideBelow],
                          column.className,
                        )}
                        aria-sort={
                          sort?.key === column.key
                            ? sort.direction === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : column.sortable
                              ? 'none'
                              : undefined
                        }
                      >
                        {column.sortable ? (
                          <button
                            type="button"
                            onClick={() => cycleSort(column)}
                            className={cn(
                              'inline-flex items-center gap-1 uppercase tracking-[0.08em] hover:text-ink-800',
                              column.align === 'right' && 'flex-row-reverse',
                            )}
                          >
                            {column.header}
                            {sort?.key === column.key ? (
                              sort.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-40" />
                            )}
                          </button>
                        ) : (
                          column.header
                        )}
                      </th>
                    ))}
                    {rowActions && <th className="w-12 text-right"><span className="sr-only">Actions</span></th>}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((row) => {
                    const id = getRowId(row)
                    return (
                      <tr
                        key={id}
                        className={cn(onRowClick && 'cursor-pointer')}
                        onClick={() => onRowClick?.(row)}
                        tabIndex={onRowClick ? 0 : undefined}
                        onKeyDown={(event) => {
                          if (onRowClick && (event.key === 'Enter' || event.key === ' ')) {
                            event.preventDefault()
                            onRowClick(row)
                          }
                        }}
                      >
                        {selectable && (
                          <td onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              aria-label={`Select row ${id}`}
                              checked={selected.has(id)}
                              onChange={() => toggleOne(id)}
                              className="h-4 w-4 rounded border-ink-300 accent-brand-600"
                            />
                          </td>
                        )}
                        {columns.map((column) => (
                          <td
                            key={column.key}
                            className={cn(
                              density === 'compact' && 'py-2.5',
                              column.align === 'right' && 'text-right tabular-nums',
                              column.align === 'center' && 'text-center',
                              column.hideBelow && hideClasses[column.hideBelow],
                              column.className,
                            )}
                          >
                            {column.render ? column.render(row) : (column.accessor?.(row) ?? '—')}
                          </td>
                        ))}
                        {rowActions && (
                          <td className="text-right" onClick={(event) => event.stopPropagation()}>
                            {rowActions(row)}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="divide-y divide-ink-100 md:hidden">
            {selectable && (
              <div className="flex items-center gap-2 bg-ivory-50 px-4 py-2 text-xs text-ink-500">
                <input
                  type="checkbox"
                  aria-label="Select all rows on this page"
                  checked={paged.length > 0 && paged.every((row) => selected.has(getRowId(row)))}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-ink-300 accent-brand-600"
                />
                Select page
              </div>
            )}
            {paged.map((row) => {
              const id = getRowId(row)
              return (
                <div
                  key={id}
                  className={cn('px-4 py-3.5', onRowClick && 'cursor-pointer active:bg-ivory-50')}
                  onClick={() => onRowClick?.(row)}
                >
                  <div className="flex items-start gap-2.5">
                    {selectable && (
                      <input
                        type="checkbox"
                        aria-label={`Select row ${id}`}
                        checked={selected.has(id)}
                        onChange={(event) => {
                          event.stopPropagation()
                          toggleOne(id)
                        }}
                        onClick={(event) => event.stopPropagation()}
                        className="mt-0.5 h-4 w-4 rounded border-ink-300 accent-brand-600"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-ink-900">{mobileTitle(row)}</div>
                          {mobileSubtitle && <div className="mt-0.5 text-xs text-ink-500">{mobileSubtitle(row)}</div>}
                        </div>
                        {rowActions && <div onClick={(event) => event.stopPropagation()}>{rowActions(row)}</div>}
                      </div>
                      {mobileMeta && <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">{mobileMeta(row)}</div>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex flex-col items-center justify-between gap-3 border-t border-ink-100 bg-ivory-50/50 px-4 py-3 sm:flex-row">
            <div className="flex items-center gap-2 text-xs text-ink-500">
              <span>
                {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sorted.length)} of {sorted.length}
              </span>
              <span className="text-ink-300">·</span>
              <label className="flex items-center gap-1.5">
                <SlidersHorizontal className="h-3 w-3" aria-hidden />
                <span className="sr-only sm:not-sr-only">Rows</span>
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  className="rounded-md border border-ink-200 bg-white px-1.5 py-0.5 text-xs focus:border-brand-400"
                  aria-label="Rows per page"
                >
                  {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-1.5">
              <IconButton label="Previous page" size="sm" variant="outline" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </IconButton>
              <span className="px-2 text-xs font-medium text-ink-600">
                Page {safePage} of {totalPages}
              </span>
              <IconButton label="Next page" size="sm" variant="outline" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
                <ChevronRight className="h-4 w-4" />
              </IconButton>
            </div>
          </div>
        </>
      )}

      {exportFilename && (
        <CsvExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          title={exportTitle}
          description={exportDescription}
          filename={exportFilename}
          rows={sorted}
          columns={exportColumns}
          getDate={exportDate}
          initialFrom={exportInitialFrom}
          initialTo={exportInitialTo}
        />
      )}
    </div>
  )
}
