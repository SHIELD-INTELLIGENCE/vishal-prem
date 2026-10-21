import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Info,
  LifeBuoy,
  Package,
  Rocket,
  Search,
  SearchX,
  Settings2,
  ShieldCheck,
  Users,
  WalletCards,
} from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { PageHeader } from '@/components/ui/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { HelpLink } from '@/components/ui/HelpLink'
import { cn } from '@/lib/utils'
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  helpArticleById,
  searchHelp,
  type HelpArticle,
  type HelpCategory,
} from './helpContent'

const CATEGORY_ICONS: Record<HelpCategory, typeof Rocket> = {
  'Getting started': Rocket,
  'Daily operations': ClipboardList,
  Catalogue: Package,
  'Customers & parties': Users,
  'Money & reports': WalletCards,
  Administration: Settings2,
  'Account & support': LifeBuoy,
}

const QUICK_LINKS = [
  { id: 'getting-started', label: 'First-time setup' },
  { id: 'orders', label: 'Create an order' },
  { id: 'bookings', label: 'Party bookings' },
  { id: 'staff', label: 'Staff & permissions' },
  { id: 'security', label: 'Password & sign-in' },
  { id: 'troubleshooting', label: 'Fix an error' },
]

export function HelpPage() {
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<HelpCategory | 'all'>('all')

  const selectedId = searchParams.get('article')
  const activeArticle = helpArticleById(selectedId)

  const results = useMemo(() => {
    const searched = searchHelp(query)
    if (category === 'all') return searched
    return searched.filter((article) => article.category === category)
  }, [query, category])

  const resultsByCategory = useMemo(() => {
    const map = new Map<HelpCategory, HelpArticle[]>()
    for (const article of results) {
      const list = map.get(article.category) ?? []
      list.push(article)
      map.set(article.category, list)
    }
    return map
  }, [results])

  function openArticle(id: string) {
    setSearchParams({ article: id })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function closeArticle() {
    setSearchParams({})
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (activeArticle) {
    return (
      <ArticleView
        article={activeArticle}
        onBack={closeArticle}
        onOpen={openArticle}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Help & support"
        title="Help centre"
        description="Practical guides for every screen in the workspace. Search by task, or browse a category."
      />

      <section className="surface-card overflow-hidden">
        <div className="bg-gradient-to-br from-ivory-100 via-white to-brand-50/50 p-5 sm:p-6">
          <label htmlFor="help-search" className="text-sm font-semibold text-ink-800">
            What do you need to do?
          </label>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden />
            <input
              id="help-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search: cancel an order, change email, add a product…"
              className="field-input pl-10"
              aria-describedby="help-search-hint"
            />
          </div>
          <p id="help-search-hint" className="mt-2 text-xs text-ink-500">
            Search covers titles, steps, fields, common mistakes and troubleshooting.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {QUICK_LINKS.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => openArticle(link.id)}
                className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 transition hover:border-brand-300 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                {link.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter help by category">
        <CategoryChip active={category === 'all'} onClick={() => setCategory('all')} label="All guides" count={HELP_ARTICLES.length} />
        {HELP_CATEGORIES.map((item) => (
          <CategoryChip
            key={item}
            active={category === item}
            onClick={() => setCategory(item)}
            label={item}
            count={HELP_ARTICLES.filter((article) => article.category === item).length}
          />
        ))}
      </div>

      <p className="text-xs font-medium text-ink-500" role="status" aria-live="polite">
        {results.length} {results.length === 1 ? 'guide' : 'guides'}
        {query.trim() ? ` matching “${query.trim()}”` : ''}
      </p>

      {results.length === 0 ? (
        <div className="surface-card p-8 text-center">
          <SearchX className="mx-auto h-8 w-8 text-ink-300" aria-hidden />
          <h2 className="mt-3 font-display text-lg font-semibold text-ink-900">No matching guide</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
            Try a shorter phrase such as “order”, “payment”, “password” or “index”. If the topic is not covered,
            ask your Super Admin to request a new guide.
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => {
              setQuery('')
              setCategory('all')
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {HELP_CATEGORIES.filter((item) => resultsByCategory.has(item)).map((item) => {
            const Icon = CATEGORY_ICONS[item]
            const articles = resultsByCategory.get(item) ?? []
            return (
              <section key={item} aria-labelledby={`help-category-${slug(item)}`}>
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <h2 id={`help-category-${slug(item)}`} className="font-display text-lg font-semibold text-ink-900">
                    {item}
                  </h2>
                  <span className="text-xs text-ink-400">{articles.length}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {articles.map((article) => (
                    <button
                      key={article.id}
                      type="button"
                      onClick={() => openArticle(article.id)}
                      className="group surface-card flex h-full flex-col p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-float focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold leading-snug text-ink-900 group-hover:text-brand-700">
                          {article.title}
                        </h3>
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-ink-300 group-hover:text-brand-600" aria-hidden />
                      </div>
                      <p className="mt-1.5 flex-1 text-xs leading-relaxed text-ink-500">{article.summary}</p>
                      {article.permission && (
                        <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-400">
                          <ShieldCheck className="h-3 w-3" aria-hidden /> {article.permission}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <section className="surface-card p-5">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
          <div>
            <h2 className="font-display text-base font-semibold text-ink-900">Still stuck?</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-600">
              {profile?.role === 'super_admin'
                ? 'As the workspace Super Admin, first check the troubleshooting guide. Sign-in, permissions and database setup are managed outside the business screens.'
                : 'Ask your workspace Super Admin for help. Include the page name, what you expected, and the exact message shown on screen. Never share your password.'}
            </p>
            <div className="mt-2">
              <HelpLink article="troubleshooting" label="Open the troubleshooting guide" />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function CategoryChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        active
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-ink-200 bg-white text-ink-600 hover:border-brand-200 hover:text-brand-700',
      )}
    >
      {label}
      <span className={cn('rounded-full px-1.5 text-[10px]', active ? 'bg-white/20' : 'bg-ivory-200 text-ink-500')}>
        {count}
      </span>
    </button>
  )
}

function ArticleView({
  article,
  onBack,
  onOpen,
}: {
  article: HelpArticle
  onBack: () => void
  onOpen: (id: string) => void
}) {
  const Icon = CATEGORY_ICONS[article.category]
  const related = HELP_ARTICLES.filter(
    (item) => item.category === article.category && item.id !== article.id,
  ).slice(0, 4)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} leftIcon={<ArrowLeft className="h-4 w-4" />}>
          All guides
        </Button>
        <Link
          to="/admin/help"
          onClick={(event) => {
            event.preventDefault()
            onBack()
          }}
          className="text-xs font-semibold text-brand-700 hover:underline"
        >
          Help centre home
        </Link>
      </div>

      <article className="surface-card overflow-hidden">
        <header className="border-b border-ink-100 bg-gradient-to-br from-ivory-100 via-white to-brand-50/40 p-5 sm:p-6">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700">
            <Icon className="h-3.5 w-3.5" aria-hidden /> {article.category}
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold leading-tight text-ink-950 sm:text-3xl">
            {article.title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600">{article.summary}</p>
          {article.permission && (
            <div className="mt-3">
              <Badge tone="neutral">
                <ShieldCheck className="mr-1 inline h-3 w-3" aria-hidden /> {article.permission}
              </Badge>
            </div>
          )}
        </header>

        <div className="space-y-6 p-5 sm:p-6">
          <section>
            <h2 className="font-display text-base font-semibold text-ink-900">What this does</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{article.what}</p>
          </section>

          <section>
            <h2 className="font-display text-base font-semibold text-ink-900">When to use it</h2>
            <ul className="mt-2 space-y-1.5">
              {article.when.map((item) => (
                <li key={item} className="flex gap-2 text-sm leading-relaxed text-ink-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sage-600" aria-hidden />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="font-display text-base font-semibold text-ink-900">Step by step</h2>
            <ol className="mt-2 space-y-2">
              {article.steps.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm leading-relaxed text-ink-700">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>

          {article.fields && article.fields.length > 0 && (
            <section>
              <h2 className="font-display text-base font-semibold text-ink-900">Fields explained</h2>
              <div className="table-shell mt-2 rounded-xl border border-ink-200">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>What it means</th>
                    </tr>
                  </thead>
                  <tbody>
                    {article.fields.map((field) => (
                      <tr key={field.label}>
                        <td className="w-48 font-semibold text-ink-800">{field.label}</td>
                        <td className="text-ink-600">{field.meaning}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {article.after && (
            <section className="rounded-xl border border-sage-200 bg-sage-50/60 p-4">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink-900">
                <CheckCircle2 className="h-4 w-4 text-sage-700" aria-hidden /> After you save
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{article.after}</p>
            </section>
          )}

          {article.destructive && (
            <section className="rounded-xl border border-brand-200 bg-brand-50/70 p-4">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold text-brand-900">
                <AlertTriangle className="h-4 w-4 text-brand-700" aria-hidden /> This cannot be undone
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-brand-900">{article.destructive}</p>
            </section>
          )}

          {article.mistakes && article.mistakes.length > 0 && (
            <section>
              <h2 className="font-display text-base font-semibold text-ink-900">Common mistakes and recovery</h2>
              <ul className="mt-2 space-y-2">
                {article.mistakes.map((item) => (
                  <li key={item} className="flex gap-2 text-sm leading-relaxed text-ink-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {article.limitations && article.limitations.length > 0 && (
            <section>
              <h2 className="font-display text-base font-semibold text-ink-900">Limitations and unavailable features</h2>
              <ul className="mt-2 space-y-1.5">
                {article.limitations.map((item) => (
                  <li key={item} className="flex gap-2 text-sm leading-relaxed text-ink-600">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </article>

      {related.length > 0 && (
        <section>
          <h2 className="mb-2 font-display text-base font-semibold text-ink-900">Related guides</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {related.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpen(item.id)}
                className="surface-card flex items-center justify-between gap-3 p-3 text-left text-sm font-medium text-ink-800 transition hover:border-brand-200 hover:text-brand-700"
              >
                <span>{item.title}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" aria-hidden />
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white p-4">
        <p className="flex items-center gap-2 text-xs text-ink-500">
          <BookOpenCheck className="h-4 w-4 text-brand-600" aria-hidden /> Only verified features are documented here.
        </p>
        <Button variant="outline" size="sm" onClick={onBack} leftIcon={<ArrowLeft className="h-4 w-4" />}>
          Back to all guides
        </Button>
      </div>
    </div>
  )
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}
