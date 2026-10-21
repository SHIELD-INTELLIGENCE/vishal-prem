import { Dialog } from '@/components/ui/Dialog'

const SHORTCUTS: Array<{ keys: string[]; description: string }> = [
  { keys: ['⌘', 'K'], description: 'Open the jump-to menu (Ctrl + K on Windows/Linux)' },
  { keys: ['/'], description: 'Focus the search field on the current page' },
  { keys: ['G', 'D'], description: 'Go to dashboard' },
  { keys: ['G', 'O'], description: 'Go to orders' },
  { keys: ['G', 'B'], description: 'Go to party bookings' },
  { keys: ['G', 'P'], description: 'Go to products' },
  { keys: ['G', 'C'], description: 'Go to customers' },
  { keys: ['?'], description: 'Show this shortcut list' },
  { keys: ['Esc'], description: 'Close a dialog or menu' },
]

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts" description="Shortcuts are ignored while typing in a field." size="sm">
      <ul className="divide-y divide-ink-100">
        {SHORTCUTS.map((shortcut) => (
          <li key={shortcut.description} className="flex items-center justify-between gap-4 py-2.5 text-sm">
            <span className="text-ink-600">{shortcut.description}</span>
            <span className="flex shrink-0 gap-1">
              {shortcut.keys.map((key) => <span key={key} className="key-hint h-6 min-w-6 text-[10px]">{key}</span>)}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 rounded-lg bg-ivory-50 px-3 py-2 text-[11px] leading-relaxed text-ink-500">
        Shortcuts use a short sequence: press G, then the second key within one second.
      </p>
    </Dialog>
  )
}
