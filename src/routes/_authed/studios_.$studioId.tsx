import { convexQuery } from '@convex-dev/react-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, Outlet, createFileRoute, useRouterState } from '@tanstack/react-router'
import { type Id } from 'convex/_generated/dataModel'
import { api } from 'convex/_generated/api'

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export const Route = createFileRoute('/_authed/studios_/$studioId')({
  component: RouteComponent,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(convexQuery(api.studios.listMine, {}))
  },
})

function RouteComponent() {
  const { studioId } = Route.useParams()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { data: studios } = useSuspenseQuery(convexQuery(api.studios.listMine, {}))
  const selectedStudio = studios.find((studio) => studio._id === studioId)
  const isSessionsRoute = pathname === `/studios/${studioId}/sessions`

  if (isSessionsRoute) {
    return <Outlet />
  }

  if (selectedStudio === undefined) {
    return (
      <section className="mx-auto w-full max-w-4xl px-1 py-2">
        <article className="hp-panel border-foreground/12 bg-card p-6 sm:p-8">
          <p className="hp-chip border-foreground/12 bg-background text-muted-foreground">
            Studio Dashboard
          </p>
          <h1 className="mt-4 text-3xl font-bold text-foreground sm:text-4xl">
            Studio not found
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            This studio is not linked to your account.
          </p>
          <div className="mt-6">
            <Link to="/studios" className="hp-secondary-btn">
              Back to my studios
            </Link>
          </div>
        </article>
      </section>
    )
  }

  return <StudioDashboard studioId={selectedStudio._id} />
}

function StudioDashboard({ studioId }: { studioId: Id<'studios'> }) {
  const { data } = useSuspenseQuery(
    convexQuery(api.studios.dashboard, {
      studioId,
    }),
  )

  return (
    <section className="mx-auto w-full max-w-6xl px-1 py-1 sm:py-2">
      <article className="hp-panel relative overflow-hidden border-foreground/12 bg-card p-6 sm:p-8">
        <div
          className="pointer-events-none absolute -left-10 -top-10 h-44 w-44 rounded-full blur-3xl"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--chart-2) 18%, transparent)',
          }}
        />
        <p className="hp-chip border-foreground/12 bg-background text-muted-foreground">
          Studio Dashboard
        </p>
        <h1 className="mt-4 text-4xl leading-[0.95] font-bold text-foreground sm:text-5xl">
          {data.studio.name}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {data.studio.address}
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <MetricCard label="Members" value={String(data.memberCount)} />
          <MetricCard
            label="Recent List"
            value={`${Math.min(data.memberCount, 10)} members`}
          />
          <MetricCard
            label="Created"
            value={dateFormatter.format(data.studio.createdAt)}
          />
        </div>
        <div className="mt-5">
          <Link
            to="/studios/$studioId/sessions"
            params={{ studioId }}
            className="hp-secondary-btn px-4 py-2"
          >
            Manage sessions
          </Link>
        </div>
      </article>

      <article className="hp-panel mt-4 border-foreground/12 bg-card p-4 sm:p-6">
        <div className="flex flex-col gap-2 border-b border-foreground/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="hp-chip border-foreground/12 bg-background text-muted-foreground">
              Members
            </p>
            <h2 className="mt-3 text-2xl font-bold text-foreground">
              Most recent 10 members
            </h2>
          </div>
          <Link to="/studios" className="hp-secondary-btn px-4 py-2">
            Manage studios
          </Link>
        </div>

        {data.recentMembers.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-foreground/15 bg-background/70 px-4 py-6 text-sm text-muted-foreground">
            No members have joined this studio yet.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {data.recentMembers.map((member, index) => (
              <article
                key={member.userId}
                className="rounded-2xl border border-foreground/12 bg-background px-4 py-4 sm:px-5"
                style={{ animationDelay: `${120 + index * 60}ms` }}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-foreground/12 bg-card text-sm font-bold text-foreground">
                      {getInitials(member.name)}
                    </div>
                    <div>
                      <p className="text-base font-semibold text-foreground">{member.name}</p>
                      <p className="text-sm text-muted-foreground">{member.email}</p>
                    </div>
                  </div>
                  <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                    Joined {dateFormatter.format(member.joinedAt)}
                  </p>
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

function getInitials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return '?'
  }

  if (words.length === 1) {
    return words[0]!.slice(0, 2).toUpperCase()
  }

  return `${words[0]![0]}${words[1]![0]}`.toUpperCase()
}
