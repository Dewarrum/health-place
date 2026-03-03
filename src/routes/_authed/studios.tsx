import { convexQuery } from '@convex-dev/react-query'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { api } from 'convex/_generated/api'
import { useMutation } from 'convex/react'
import { type FormEvent, useMemo, useState } from 'react'

const createdAtFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export const Route = createFileRoute('/_authed/studios')({
  component: RouteComponent,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(convexQuery(api.user.profile, {}))
    await context.queryClient.ensureQueryData(convexQuery(api.studios.listMine, {}))
  },
})

function RouteComponent() {
  const queryClient = useQueryClient()
  const { data: profile } = useSuspenseQuery(convexQuery(api.user.profile, {}))
  const { data: studios } = useSuspenseQuery(convexQuery(api.studios.listMine, {}))
  const createStudio = useMutation(api.studios.create)

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const studiosQuery = convexQuery(api.studios.listMine, {})
  const recentStudioName = useMemo(() => studios[0]?.name ?? 'No studios yet', [studios])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSaving(true)

    try {
      await createStudio({ name, address })
      setName('')
      setAddress('')
      await queryClient.invalidateQueries({ queryKey: studiosQuery.queryKey })
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Could not create studio.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  if (profile === null) {
    return (
      <section className="mx-auto w-full max-w-4xl px-1 py-2">
        <article className="hp-panel border-foreground/12 bg-card p-6 sm:p-8">
          <p className="hp-chip border-foreground/12 bg-background text-muted-foreground">
            Studio Management
          </p>
          <h1 className="mt-4 text-3xl font-bold text-foreground sm:text-4xl">
            Complete your profile first
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            We need your profile to map each studio to a real account owner.
          </p>
          <div className="mt-6">
            <Link to="/user" search={{ redirectTo: '/studios' }} className="hp-primary-btn">
              Finish profile setup
            </Link>
          </div>
        </article>
      </section>
    )
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-1 py-1 sm:py-2">
      <div className="grid gap-4 lg:grid-cols-[1.06fr_0.94fr]">
        <article className="hp-panel relative overflow-hidden border-foreground/12 bg-card p-6 sm:p-8">
          <div
            className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full blur-3xl"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--signal) 18%, transparent)',
            }}
          />
          <p className="hp-chip border-foreground/12 bg-background text-muted-foreground">
            Studio Management
          </p>
          <h1 className="mt-4 text-4xl leading-[0.95] font-bold text-foreground sm:text-5xl">
            Build your studio list
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Register each location with a clear address so your operations and booking
            setup stay organized.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <MetricCard label="Owner" value={profile.name} />
            <MetricCard label="Total Studios" value={String(studios.length)} />
            <MetricCard label="Latest" value={recentStudioName} />
          </div>
        </article>

        <form
          onSubmit={onSubmit}
          className="hp-panel border-foreground/12 bg-card p-6 sm:p-8"
        >
          <p className="hp-chip border-foreground/12 bg-background text-muted-foreground">
            Add Studio
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="studio-name" className="mb-2 block text-sm font-semibold text-foreground">
                Studio name
              </label>
              <input
                id="studio-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="hp-field"
                placeholder="Pulse Core Studio"
                required
              />
            </div>

            <div>
              <label htmlFor="studio-address" className="mb-2 block text-sm font-semibold text-foreground">
                Address
              </label>
              <textarea
                id="studio-address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                className="hp-field min-h-[104px] resize-none"
                placeholder="1234 W Olympic Blvd, Los Angeles, CA"
                required
              />
            </div>

            {error ? (
              <p className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <button type="submit" disabled={isSaving} className="hp-primary-btn w-full sm:w-auto">
              {isSaving ? 'Creating...' : 'Create studio'}
            </button>
          </div>
        </form>
      </div>

      <article className="hp-panel mt-4 border-foreground/12 bg-card p-4 sm:p-6">
        <div className="flex flex-col gap-2 border-b border-foreground/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="hp-chip border-foreground/12 bg-background text-muted-foreground">
              Your Studios
            </p>
            <h2 className="mt-3 text-2xl font-bold text-foreground">Registered locations</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {studios.length} {studios.length === 1 ? 'studio' : 'studios'} linked to your account
          </p>
        </div>

        {studios.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-foreground/15 bg-background/70 px-4 py-6 text-sm text-muted-foreground">
            No studios yet. Add your first studio using the form above.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {studios.map((studio, index) => (
              <article
                key={studio._id}
                className="rounded-2xl border border-foreground/12 bg-background px-4 py-4 sm:px-5"
                style={{ animationDelay: `${120 + index * 60}ms` }}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{studio.name}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {studio.address}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                      Added {createdAtFormatter.format(studio._creationTime)}
                    </p>
                    <Link
                      to="/studios/$studioId"
                      params={{ studioId: studio._id }}
                      className="hp-secondary-btn px-3 py-1.5 text-xs"
                    >
                      Open dashboard
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </article>
    </section>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-foreground/12 bg-background px-3 py-3">
      <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 line-clamp-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  )
}
