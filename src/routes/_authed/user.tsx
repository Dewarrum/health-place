import { convexQuery } from '@convex-dev/react-query'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  Link,
  createFileRoute,
  useNavigate,
} from '@tanstack/react-router'
import { api } from 'convex/_generated/api'
import { useMutation } from 'convex/react'
import { type FormEvent, useState } from 'react'

export const Route = createFileRoute('/_authed/user')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirectTo:
      typeof search.redirectTo === 'string' && search.redirectTo.startsWith('/')
        ? search.redirectTo
        : undefined,
  }),
  component: RouteComponent,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      convexQuery(api.user.profileDraft, {}),
    )
  },
})

function RouteComponent() {
  const { redirectTo } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const upsertProfile = useMutation(api.user.upsertProfile)
  const { data: profileDraft } = useSuspenseQuery(
    convexQuery(api.user.profileDraft, {}),
  )
  const [name, setName] = useState(profileDraft?.name ?? '')
  const [email, setEmail] = useState(profileDraft?.email ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const profileQuery = convexQuery(api.user.profile, {})
  const profileDraftQuery = convexQuery(api.user.profileDraft, {})

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setError(null)
    setIsSaving(true)
    try {
      await upsertProfile({ name, email })
      await queryClient.invalidateQueries({ queryKey: profileQuery.queryKey })
      await queryClient.invalidateQueries({ queryKey: profileDraftQuery.queryKey })
      await navigate({ to: redirectTo ?? '/' })
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to save profile.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  if (profileDraft?.hasProfile === false) {
    return (
      <section className="mx-auto w-full max-w-5xl px-1 py-4 sm:py-8">
        <div className="grid gap-4 lg:grid-cols-[1fr_1.05fr] lg:gap-6">
          <article className="hp-panel border-foreground/12 bg-card p-5 sm:p-7">
            <p className="hp-chip border-foreground/12 bg-background text-muted-foreground">
              Account Setup
            </p>
            <h1 className="mt-4 text-3xl font-bold text-foreground sm:text-4xl">
              Create your profile
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Health Place uses these details to personalize your booking experience and
              confirm reservations.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <InfoPill label="Secure" value="Clerk auth" />
              <InfoPill label="Save time" value="One-step booking" />
              <InfoPill label="Editable" value="Anytime" />
            </div>
          </article>

          <form
            onSubmit={onSubmit}
            className="hp-panel border-foreground/12 bg-card p-5 sm:p-7"
          >
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground" htmlFor="name">
                  Name
                </label>
                <input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="hp-field"
                  placeholder="Your full name"
                  autoComplete="name"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-foreground" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="hp-field"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>

              {error ? (
                <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <button type="submit" disabled={isSaving} className="hp-primary-btn w-full sm:w-auto">
                {isSaving ? 'Saving...' : 'Save profile'}
              </button>

              <p className="text-xs text-muted-foreground">
                By continuing, you allow Health Place to store this profile for reservation
                confirmations.
              </p>
            </div>
          </form>
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto w-full max-w-4xl px-1 py-4 sm:py-8">
      <article className="hp-panel border-foreground/12 bg-card p-5 sm:p-8">
        <p className="hp-chip border-foreground/12 bg-background text-muted-foreground">
          Account Active
        </p>
        <h1 className="mt-4 text-3xl font-bold text-foreground sm:text-4xl">
          Welcome back, {profileDraft?.name}.
        </h1>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          Your booking profile is ready. We will use <span className="font-semibold text-foreground">{profileDraft?.email}</span> for
          reservation updates.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link to="/" className="hp-primary-btn">
            Browse studios
          </Link>
          <p className="hp-secondary-btn cursor-default">Profile complete</p>
        </div>
      </article>
    </section>
  )
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-foreground/12 bg-background px-3 py-3">
      <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}
