import { createFileRoute, Link } from '@tanstack/react-router'
import {
  SignInButton,
  SignedIn,
  SignedOut,
  UserButton,
} from '@clerk/tanstack-react-start'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      {
        title: 'Health Place | Find gyms and Pilates studios',
      },
      {
        name: 'description',
        content:
          'Find the right gym or Pilates studio nearby and reserve your next session in minutes.',
      },
    ],
  }),
  component: Home,
})

function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-teal-50 via-white to-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-20 h-56 w-56 rounded-full bg-emerald-200/45 blur-3xl" />
        <div className="absolute -right-16 top-16 h-64 w-64 rounded-full bg-cyan-200/45 blur-3xl" />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-col px-4 pb-10 pt-4 sm:px-6 sm:pb-14 sm:pt-6 lg:px-8">
        <header className="flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-white px-3 py-1 text-sm font-semibold text-teal-800"
          >
            <span className="inline-block size-2 rounded-full bg-teal-500" />
            Health Place
          </Link>

          <div className="flex items-center gap-2">
            <SignedOut>
              <SignInButton mode="modal" forceRedirectUrl="/user">
                <button
                  type="button"
                  className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-neutral-400 hover:text-neutral-900"
                >
                  Log in
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <UserButton />
            </SignedIn>
          </div>
        </header>

        <section className="mx-auto mt-14 grid w-full max-w-5xl gap-8 lg:mt-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="text-center lg:text-left">
            <p className="inline-flex rounded-full border border-teal-200 bg-white px-3 py-1 text-xs font-semibold tracking-[0.08em] text-teal-700 uppercase">
              Gym + Pilates Discovery
            </p>
            <h1 className="mt-5 text-balance text-4xl font-semibold leading-tight tracking-tight text-neutral-900 sm:text-5xl">
              Find the right gym or Pilates studio in minutes.
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-pretty text-base leading-relaxed text-neutral-600 sm:text-lg lg:mx-0">
              Search nearby places, compare class options at a glance, and book
              your next workout session in just a few taps.
            </p>

            <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row lg:justify-start">
              <SignedOut>
                <SignInButton mode="modal" forceRedirectUrl="/user">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-500"
                  >
                    Make a reservation
                  </button>
                </SignInButton>
              </SignedOut>
              <SignedIn>
                <Link
                  to="/user"
                  search={{ redirectTo: undefined }}
                  className="inline-flex items-center justify-center rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-500"
                >
                  Make a reservation
                </Link>
              </SignedIn>
              <SignedOut>
                <Link
                  to="/user"
                  search={{ redirectTo: '/' }}
                  className="inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-5 py-3 text-sm font-semibold text-neutral-800 transition hover:border-neutral-400"
                >
                  Browse places
                </Link>
              </SignedOut>
              <SignedIn>
                <Link
                  to="/user"
                  search={{ redirectTo: undefined }}
                  className="inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-5 py-3 text-sm font-semibold text-neutral-800 transition hover:border-neutral-400"
                >
                  Go to account
                </Link>
              </SignedIn>
            </div>
          </div>

          <div className="mx-auto w-full max-w-md rounded-2xl border border-teal-100 bg-white/95 p-4 shadow-[0_24px_80px_-24px_rgba(13,148,136,0.35)] backdrop-blur sm:p-5">
            <div className="rounded-xl border border-teal-100 bg-teal-50 p-3">
              <p className="text-xs font-medium tracking-wide text-teal-700 uppercase">
                Nearby today
              </p>
              <div className="mt-3 space-y-2.5">
                <div className="rounded-lg border border-teal-100 bg-white p-3">
                  <p className="text-sm font-semibold text-neutral-900">
                    Core Flow Pilates
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    0.9 mi away • Beginner classes
                  </p>
                </div>
                <div className="rounded-lg border border-teal-100 bg-white p-3">
                  <p className="text-sm font-semibold text-neutral-900">
                    Southside Strength Gym
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    1.2 mi away • Open until 11:00 PM
                  </p>
                </div>
                <div className="rounded-lg border border-teal-100 bg-white p-3">
                  <p className="text-sm font-semibold text-neutral-900">
                    Placeholder Studio
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Add your own studio cards here later
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <footer className="border-t border-neutral-200 bg-white/85">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-neutral-600 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} Health Place</p>
          <p>Find your next class faster.</p>
        </div>
      </footer>
    </main>
  )
}
