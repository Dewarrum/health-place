import { createFileRoute, useLocation } from '@tanstack/react-router'
import { SignIn } from '@clerk/tanstack-react-start'

export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ context }) => {
    if (!context.userId) {
      throw new Error('Not authenticated')
    }
  },
  errorComponent: ({ error }) => {
    const location = useLocation()

    if (error.message === 'Not authenticated') {
      return (
        <div className="mx-auto flex min-h-[70vh] w-full max-w-5xl items-center justify-center px-4 py-8 sm:px-0">
          <section className="hp-panel w-full max-w-2xl border-foreground/12 bg-card/95 p-4 sm:p-8">
            <div className="mb-6 space-y-2">
              <p className="hp-chip border-foreground/12 bg-background text-muted-foreground">
                Members Area
              </p>
              <h1 className="text-3xl font-bold text-foreground sm:text-4xl">
                Sign in to continue your booking flow
              </h1>
              <p className="text-sm text-muted-foreground sm:text-base">
                We need your account to save profile details and complete reservations.
              </p>
            </div>

            <div className="rounded-2xl border border-foreground/10 bg-background p-3 sm:p-5">
              <SignIn routing="hash" forceRedirectUrl={location.href} />
            </div>
          </section>
        </div>
      )
    }

    throw error
  },
})
