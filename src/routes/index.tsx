import { createFileRoute, Link } from '@tanstack/react-router'
import {
  SignInButton,
  SignedIn,
  SignedOut,
  UserButton,
} from '@clerk/tanstack-react-start'

const highlights = [
  {
    title: 'Smart filters',
    body: 'Sort by intensity, equipment, trainer style, and neighborhood before you commit.',
  },
  {
    title: 'Live availability',
    body: 'Spot open reformers and class capacity in real time, not stale snapshots.',
  },
  {
    title: 'One-minute booking',
    body: 'Save your profile once and reserve sessions with a single confirmation step.',
  },
]

const nearbyToday = [
  {
    name: 'Contour Pilates Loft',
    distance: '0.7 mi',
    detail: 'Beginner reformer, 6:30 PM slot open',
  },
  {
    name: 'Station 12 Strength',
    distance: '1.1 mi',
    detail: 'HIIT floor, open until 11:00 PM',
  },
  {
    name: 'Ember Core Studio',
    distance: '1.4 mi',
    detail: 'Mobility + sculpt, low-impact sessions',
  },
]

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      {
        title: 'Health Place | Reserve gyms and Pilates sessions',
      },
      {
        name: 'description',
        content:
          'Health Place helps you find nearby gyms and Pilates studios, compare availability, and reserve your next session in minutes.',
      },
    ],
  }),
  component: Home,
})

function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden px-4 pb-12 pt-5 sm:px-6 sm:pb-16 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-px w-full max-w-6xl -translate-x-1/2 bg-gradient-to-r from-transparent via-foreground/20 to-transparent" />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10">
        <header className="hp-reveal flex items-center justify-between gap-3">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-foreground/12 bg-card px-4 py-2 text-sm font-bold uppercase tracking-[0.14em] text-foreground"
          >
            <span className="h-2 w-2 rounded-full bg-[var(--signal)]" />
            Health Place
          </Link>

          <div className="flex items-center gap-2">
            <SignedOut>
              <SignInButton mode="modal" forceRedirectUrl="/user">
                <button type="button" className="hp-secondary-btn px-4 py-2.5">
                  Log in
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <Link
                to="/user"
                search={{ redirectTo: undefined }}
                className="hp-secondary-btn px-4 py-2.5"
              >
                My account
              </Link>
              <div className="rounded-full border border-foreground/12 bg-card p-1">
                <UserButton />
              </div>
            </SignedIn>
          </div>
        </header>

        <section className="grid items-start gap-6 lg:grid-cols-[1.12fr_0.88fr] lg:gap-8">
          <div className="space-y-7 hp-reveal [animation-delay:120ms]">
            <p className="hp-chip border-foreground/15 bg-card/85 text-muted-foreground">
              Reservation Engine
            </p>

            <div className="space-y-4">
              <h1 className="max-w-3xl text-balance text-5xl leading-[0.95] font-bold text-foreground sm:text-6xl lg:text-7xl">
                Train smarter. Book faster. Show up ready.
              </h1>
              <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Browse high-energy gyms and focused Pilates studios, compare real-time
                availability, and reserve your next class without the scheduling chaos.
              </p>
            </div>

            <div className="grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Studios listed" value="120+" />
              <Stat label="Fastest booking" value="42 sec" />
              <Stat label="Cities growing" value="18" />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <SignedOut>
                <SignInButton mode="modal" forceRedirectUrl="/user">
                  <button type="button" className="hp-primary-btn">
                    Start reserving
                  </button>
                </SignInButton>
                <Link
                  to="/user"
                  search={{ redirectTo: '/' }}
                  className="hp-secondary-btn"
                >
                  Explore first
                </Link>
              </SignedOut>

              <SignedIn>
                <Link
                  to="/user"
                  search={{ redirectTo: undefined }}
                  className="hp-primary-btn"
                >
                  Reserve a class
                </Link>
                <Link
                  to="/user"
                  search={{ redirectTo: undefined }}
                  className="hp-secondary-btn"
                >
                  Edit profile
                </Link>
              </SignedIn>
            </div>

            <div className="hp-panel flex max-w-xl items-center gap-3 border-foreground/12 bg-card px-4 py-3">
              <div
                className="h-3 w-3 rounded-full bg-[var(--signal)]"
                style={{
                  boxShadow: '0 0 0 6px color-mix(in srgb, var(--signal) 18%, transparent)',
                }}
              />
              <p className="text-sm text-muted-foreground">
                New tonight: reservation hold windows now auto-release after 10 minutes.
              </p>
            </div>
          </div>

          <div className="hp-panel relative overflow-hidden border-foreground/12 bg-card/95 p-4 hp-reveal [animation-delay:220ms] sm:p-5">
            <div
              className="pointer-events-none absolute -right-14 -top-14 h-36 w-36 rounded-full blur-3xl"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--signal) 15%, transparent)',
              }}
            />
            <div className="relative space-y-4">
              <div className="flex items-center justify-between">
                <p className="hp-chip border-foreground/12 bg-background text-foreground/70">
                  Nearby Today
                </p>
                <p className="text-xs font-medium tracking-[0.1em] text-muted-foreground uppercase">
                  Refreshed 2m ago
                </p>
              </div>

              <div className="space-y-2.5">
                {nearbyToday.map((place) => (
                  <article
                    key={place.name}
                    className="rounded-2xl border border-foreground/10 bg-background px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-base font-bold text-foreground">{place.name}</h3>
                      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {place.distance}
                      </p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{place.detail}</p>
                  </article>
                ))}
              </div>

              <div className="rounded-2xl border border-foreground/10 bg-background p-4">
                <p className="text-sm font-bold text-foreground">Book in one tap</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Save profile details once in your account and move from search to confirmation fast.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          {highlights.map((item, index) => (
            <article
              key={item.title}
              className="hp-panel border-foreground/12 bg-card px-5 py-5 hp-reveal"
              style={{ animationDelay: `${280 + index * 90}ms` }}
            >
              <p className="text-base font-bold text-foreground">{item.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </article>
          ))}
        </section>

        <footer className="pt-2 text-sm text-muted-foreground">
          <div className="flex flex-col gap-1 border-t border-foreground/12 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Health Place</p>
            <p>Find your next class before someone else grabs the spot.</p>
          </div>
        </footer>
      </div>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="hp-panel border-foreground/12 bg-card px-4 py-3">
      <p className="text-xl leading-none font-bold text-foreground sm:text-2xl">{value}</p>
      <p className="mt-1 text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </p>
    </div>
  )
}
