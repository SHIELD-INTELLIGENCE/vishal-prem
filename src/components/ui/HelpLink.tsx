import { Link } from 'react-router-dom'
import { CircleHelp } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Contextual link to a specific help article. Keep the article id aligned with
 * HELP_ARTICLES in src/features/help/helpContent.ts.
 */
export function HelpLink({
  article,
  label = 'Help for this page',
  className,
}: {
  article: string
  label?: string
  className?: string
}) {
  return (
    <Link
      to={`/admin/help?article=${encodeURIComponent(article)}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md text-xs font-semibold text-brand-700 underline-offset-2 transition hover:text-brand-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        className,
      )}
    >
      <CircleHelp className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Link>
  )
}
