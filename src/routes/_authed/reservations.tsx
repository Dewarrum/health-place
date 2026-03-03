import { convexQuery } from '@convex-dev/react-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { api } from 'convex/_generated/api'

const reservationDateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export const Route = createFileRoute('/_authed/reservations')({
  component: RouteComponent,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      convexQuery(api.sessions.listMyUpcomingReservations, {}),
    )
  },
})

function RouteComponent() {
  const { data: reservations } = useSuspenseQuery(
    convexQuery(api.sessions.listMyUpcomingReservations, {}),
  )

  return (
    <section className="mx-auto w-full max-w-6xl px-1 py-1 sm:py-2">
      <article className="hp-panel relative overflow-hidden border-foreground/12 bg-card p-6 sm:p-8">
        <div
          className="pointer-events-none absolute -right-12 -top-10 h-40 w-40 rounded-full blur-3xl"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--signal) 18%, transparent)',
          }}
        />
        <p className="hp-chip border-foreground/12 bg-background text-muted-foreground">
          My Reservations
        </p>
        <h1 className="mt-4 text-4xl leading-[0.95] font-bold text-foreground sm:text-5xl">
          Upcoming booked sessions
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Here are your next reservations. We only show sessions you are booked into.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <MetricCard label="Shown" value={String(reservations.length)} />
          <MetricCard label="Limit" value="10 upcoming" />
          <MetricCard
            label="Next start"
            value={
              reservations[0]
                ? reservationDateFormatter.format(reservations[0].startAtUtc)
                : 'No upcoming sessions'
            }
          />
        </div>
      </article>

      <article className="hp-panel mt-4 border-foreground/12 bg-card p-4 sm:p-6">
        <div className="flex flex-col gap-2 border-b border-foreground/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="hp-chip border-foreground/12 bg-background text-muted-foreground">
              Reservations
            </p>
            <h2 className="mt-3 text-2xl font-bold text-foreground">Your next sessions</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Sorted by soonest start time
          </p>
        </div>

        {reservations.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-foreground/15 bg-background/70 px-4 py-6 text-sm text-muted-foreground">
            You do not have upcoming reservations yet.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {reservations.map((reservation, index) => (
              <article
                key={reservation.instanceId}
                className="rounded-2xl border border-foreground/12 bg-background px-4 py-4 sm:px-5"
                style={{ animationDelay: `${120 + index * 60}ms` }}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{reservation.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {reservation.studioName}
                      {reservation.location ? ` · ${reservation.location}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                      Starts
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {reservationDateFormatter.format(reservation.startAtUtc)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Ends {reservationDateFormatter.format(reservation.endAtUtc)}
                    </p>
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
