import { useNavigate } from 'react-router-dom'
import { ShieldX } from 'lucide-react'
import { Button } from './Button'
import { LogoMark } from './Logo'

export function LoadingScreen({ label = 'Opening your workspace…' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ivory-50 px-6">
      <LogoMark size={64} />
      <div className="flex items-center gap-2 text-sm font-medium text-ink-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600" />
        {label}
      </div>
    </div>
  )
}

export function PermissionDenied({
  title = 'You do not have access to this area',
  description = 'Your role does not include this permission. If you need access, ask a Super Admin to update your staff profile.',
}: {
  title?: string
  description?: string
}) {
  const navigate = useNavigate()
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 ring-1 ring-brand-200">
        <ShieldX className="h-7 w-7" />
      </div>
      <h1 className="font-display text-2xl font-semibold text-ink-950">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-500">{description}</p>
      <Button className="mt-5" variant="outline" onClick={() => navigate('/admin')}>
        Back to dashboard
      </Button>
    </div>
  )
}
