import { Link } from 'react-router-dom'
import { ArrowRight, CakeSlice, CookingPot, ShieldCheck, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { LogoMark } from '@/components/ui/Logo'

const SPECIALTIES = [
  {
    icon: CakeSlice,
    title: 'Celebration cakes',
    body: 'Made to order for birthdays, anniversaries and family occasions.',
  },
  {
    icon: Sparkles,
    title: 'Sweets & gajak',
    body: 'Traditional mithai and seasonal gajak, prepared in small batches.',
  },
  {
    icon: CookingPot,
    title: 'Hot section',
    body: 'Fresh patties and savoury bakes through the day.',
  },
]

/**
 * Public landing page at `/`.
 *
 * Deliberately static: it never reads Firestore or any management data, and it
 * contains no roadmap, developer notes or placeholder claims about features
 * that do not exist yet. The only application entry point is a clear link to
 * the staff workspace at `/admin`.
 */
export function LandingPage() {
  const year = new Date().getFullYear()

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-ivory-50">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(circle at 12% 8%, rgb(246 194 202 / 0.55) 0, transparent 30%), radial-gradient(circle at 88% 88%, rgb(243 223 165 / 0.65) 0, transparent 34%)',
        }}
      />

      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-6 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <LogoMark size={44} />
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-semibold leading-tight tracking-tight text-ink-950">
              Vishal Prem
            </p>
            <p className="truncate text-[10px] font-bold uppercase tracking-[0.2em] text-brand-700">
              Bakery &amp; Sweets
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" leftIcon={<ShieldCheck className="h-4 w-4" />}>
          <Link to="/admin">Staff sign in</Link>
        </Button>
      </header>

      <main className="relative mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:py-16">
        <section>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-700">
            Fresh from our kitchen
          </p>
          <h1 className="mt-4 max-w-xl font-display text-4xl font-semibold leading-[1.05] tracking-tight text-ink-950 sm:text-5xl lg:text-[56px]">
            Cakes, sweets and fresh bakes for the moments that matter.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-ink-600">
            Vishal Prem Bakery &amp; Sweets serves takeaway cakes, sweets, patties and gajak from both outlets.
            Party and bulk orders are arranged with our team in store.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild size="lg" rightIcon={<ArrowRight className="h-4 w-4" />}>
              <Link to="/admin">Staff sign in</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#visit">Visit the shop</a>
            </Button>
          </div>
          <p className="mt-5 text-xs leading-relaxed text-ink-500">
            Staff access is restricted to authorised accounts issued by a Super Admin.
          </p>
        </section>

        <section
          id="visit"
          aria-labelledby="visit-heading"
          className="rounded-2xl border border-ivory-300 bg-white/80 p-6 shadow-card backdrop-blur sm:p-7"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-700">What we make</p>
          <h2 id="visit-heading" className="mt-1.5 font-display text-2xl font-semibold tracking-tight text-ink-950">
            Takeaway from both outlets
          </h2>
          <ul className="mt-5 space-y-4">
            {SPECIALTIES.map((item) => (
              <li key={item.title} className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ivory-100 text-brand-700 ring-1 ring-ivory-300">
                  <item.icon className="h-5 w-5" strokeWidth={1.8} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink-900">{item.title}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">{item.body}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-6 border-t border-ivory-300 pt-4 text-xs leading-relaxed text-ink-500">
            For a party or a large order, speak to the team at the counter so we can plan production and
            collection together.
          </div>
        </section>
      </main>

      <footer className="relative mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-ivory-300 px-5 py-5 text-xs text-ink-500 sm:px-8">
        <span>© {year} Vishal Prem Bakery &amp; Sweets</span>
        <Link to="/admin" className="font-semibold text-brand-700 hover:text-brand-800 hover:underline">
          Staff sign in
        </Link>
      </footer>
    </div>
  )
}
