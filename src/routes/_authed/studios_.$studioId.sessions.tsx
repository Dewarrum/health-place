import { convexQuery } from '@convex-dev/react-query'
import { useMutation } from 'convex/react'
import { type Id } from 'convex/_generated/dataModel'
import { api } from 'convex/_generated/api'
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { type FormEvent, useMemo, useState } from 'react'

const occurrenceDateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const weekdayOptions = [
  { label: 'Sun', value: 'SU' },
  { label: 'Mon', value: 'MO' },
  { label: 'Tue', value: 'TU' },
  { label: 'Wed', value: 'WE' },
  { label: 'Thu', value: 'TH' },
  { label: 'Fri', value: 'FR' },
  { label: 'Sat', value: 'SA' },
] as const

export const Route = createFileRoute('/_authed/studios_/$studioId/sessions')({
  component: RouteComponent,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(convexQuery(api.studios.listMine, {}))
  },
})

function RouteComponent() {
  const { studioId } = Route.useParams()
  const queryClient = useQueryClient()
  const { data: profile } = useSuspenseQuery(convexQuery(api.user.profile, {}))
  const { data: studios } = useSuspenseQuery(convexQuery(api.studios.listMine, {}))

  const selectedStudio = studios.find((studio) => studio._id === studioId)

  const now = new Date()
  const defaultStart = new Date(now)
  defaultStart.setUTCDate(defaultStart.getUTCDate() - 14)
  const defaultEnd = new Date(now)
  defaultEnd.setUTCDate(defaultEnd.getUTCDate() + 120)

  const [windowStartUtc] = useState(defaultStart.getTime())
  const [windowEndUtc] = useState(defaultEnd.getTime())

  const [title, setTitle] = useState('')
  const [notes, setNotes] = useState('')
  const [location, setLocation] = useState('')
  const [capacity, setCapacity] = useState('')
  const [durationMinutes, setDurationMinutes] = useState('60')
  const [startAtLocal, setStartAtLocal] = useState(toDatetimeLocal(new Date()))
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [scheduleKind, setScheduleKind] = useState<'single' | 'series'>('single')
  const [freq, setFreq] = useState<'DAILY' | 'WEEKLY'>('WEEKLY')
  const [interval, setInterval] = useState('1')
  const [weeklyDays, setWeeklyDays] = useState<Array<'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA'>>(['MO'])
  const [selectedParticipant, setSelectedParticipant] = useState<string>('')
  const [participantUserIds, setParticipantUserIds] = useState<Array<Id<'users'>>>([])
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [selectedOccurrenceKey, setSelectedOccurrenceKey] = useState<string | null>(null)

  const createSingle = useMutation(api.sessions.createSingle)
  const createSeries = useMutation(api.sessions.createSeries)
  const editSingle = useMutation(api.sessions.editSingle)
  const editSeriesThisEvent = useMutation(api.sessions.editSeriesThisEvent)
  const editSeriesThisAndFollowing = useMutation(api.sessions.editSeriesThisAndFollowing)
  const editSeriesAllEvents = useMutation(api.sessions.editSeriesAllEvents)
  const deleteSingle = useMutation(api.sessions.deleteSingle)
  const deleteSeriesThisEvent = useMutation(api.sessions.deleteSeriesThisEvent)
  const deleteSeriesThisAndFollowing = useMutation(api.sessions.deleteSeriesThisAndFollowing)
  const deleteSeriesAllEvents = useMutation(api.sessions.deleteSeriesAllEvents)
  const addParticipantsAllEvents = useMutation(api.sessionParticipants.addParticipantsAllEvents)
  const removeParticipantAllEvents = useMutation(api.sessionParticipants.removeParticipantAllEvents)

  const occurrencesQuery = convexQuery(api.sessions.listOccurrencesWindow, {
    studioId: studioId as Id<'studios'>,
    windowStartUtc,
    windowEndUtc,
  })

  const { data: occurrences } = useSuspenseQuery(occurrencesQuery)

  const studioMembersQuery = convexQuery(api.sessions.listStudioMemberOptions, {
    studioId: studioId as Id<'studios'>,
  })
  const { data: studioMembers } = useSuspenseQuery(studioMembersQuery)

  const selectedOccurrence = useMemo(() => {
    if (selectedOccurrenceKey === null) {
      return occurrences[0] ?? null
    }

    return occurrences.find((occurrence) => occurrence.instanceId === selectedOccurrenceKey) ?? null
  }, [occurrences, selectedOccurrenceKey])

  const participantsQueryDescriptor =
    selectedOccurrence?.rootSeriesId === null || selectedOccurrence === null
      ? null
      : convexQuery(api.sessions.listParticipantsForOccurrence, {
          rootSeriesId: selectedOccurrence.rootSeriesId,
          recurrenceIdUtc: selectedOccurrence.recurrenceIdUtc ?? null,
        })

  const participantsQuery = useQuery({
    ...(participantsQueryDescriptor ??
      convexQuery(api.sessions.listParticipantsForOccurrence, {
        rootSeriesId: studioId as unknown as Id<'sessions'>,
        recurrenceIdUtc: null,
      })),
    enabled: participantsQueryDescriptor !== null,
  })

  const canManageOccurrence = (occurrence: (typeof occurrences)[number]) =>
    selectedStudio !== undefined &&
    (occurrence.organizerId === profile?._id || selectedStudio.createdBy === profile?._id)

  const canManageSelectedOccurrence =
    selectedOccurrence !== null && canManageOccurrence(selectedOccurrence)

  const existingOccurrenceParticipantSet = useMemo(
    () => new Set((participantsQuery.data ?? []).map((participant) => participant.userId)),
    [participantsQuery.data],
  )

  async function refreshOccurrences() {
    await queryClient.invalidateQueries({ queryKey: occurrencesQuery.queryKey })
    if (participantsQueryDescriptor !== null) {
      await queryClient.invalidateQueries({ queryKey: participantsQueryDescriptor.queryKey })
    }
  }

  async function onCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (selectedStudio === undefined) {
      return
    }

    setError(null)
    setIsSaving(true)

    try {
      const parsedStart = new Date(startAtLocal)
      if (Number.isNaN(parsedStart.getTime())) {
        throw new Error('Invalid start date/time.')
      }

      const duration = Number.parseInt(durationMinutes, 10)
      if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error('Duration must be a positive number.')
      }

      const parsedCapacity = capacity.trim().length === 0 ? null : Number.parseInt(capacity, 10)
      if (parsedCapacity !== null && (!Number.isFinite(parsedCapacity) || parsedCapacity <= 0)) {
        throw new Error('Capacity must be a positive number.')
      }

      if (scheduleKind === 'single') {
        await createSingle({
          studioId: selectedStudio._id,
          title,
          notes: notes.trim().length === 0 ? null : notes,
          location: location.trim().length === 0 ? null : location,
          capacity: parsedCapacity,
          timezone,
          startAtUtc: parsedStart.getTime(),
          durationMinutes: duration,
          participantUserIds,
        })
      } else {
        const every = Number.parseInt(interval, 10)
        if (!Number.isFinite(every) || every <= 0) {
          throw new Error('Interval must be a positive number.')
        }

        await createSeries({
          studioId: selectedStudio._id,
          title,
          notes: notes.trim().length === 0 ? null : notes,
          location: location.trim().length === 0 ? null : location,
          capacity: parsedCapacity,
          timezone,
          startAtUtc: parsedStart.getTime(),
          durationMinutes: duration,
          rule: {
            freq,
            interval: every,
            byWeekday: freq === 'WEEKLY' ? weeklyDays : [],
            count: null,
            untilUtc: null,
          },
          anchorLocal: null,
          participantUserIds,
        })
      }

      setTitle('')
      setNotes('')
      setLocation('')
      setCapacity('')
      setDurationMinutes('60')
      setParticipantUserIds([])

      await refreshOccurrences()
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Could not create session.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function onEditOccurrence(occurrence: (typeof occurrences)[number]) {
    const nextTitle = window.prompt('New title', occurrence.title)
    if (nextTitle === null) {
      return
    }

    if (occurrence.sourceType === 'single' || occurrence.sourceType === 'detached') {
      if (occurrence.sessionId === null) {
        return
      }

      await editSingle({
        sessionId: occurrence.sessionId,
        expectedVersion: null,
        patch: {
          title: nextTitle,
          notes: null,
          location: null,
          capacity: null,
          durationMinutes: null,
          timezone: null,
          startAtUtc: null,
          startLocalHour: null,
          startLocalMinute: null,
        },
      })
      await refreshOccurrences()
      return
    }

    if (occurrence.seriesId === null || occurrence.recurrenceIdUtc === null) {
      return
    }

    const choice = window.prompt(
      'Edit scope: type 1 for THIS_EVENT, 2 for THIS_AND_FOLLOWING, 3 for ALL_EVENTS',
      '1',
    )

    if (choice === null) {
      return
    }

    const patch = {
      title: nextTitle,
      notes: null,
      location: null,
      capacity: null,
      durationMinutes: null,
      timezone: null,
      startAtUtc: null,
      startLocalHour: null,
      startLocalMinute: null,
    } as const

    if (choice === '1') {
      await editSeriesThisEvent({
        seriesId: occurrence.seriesId,
        recurrenceIdUtc: occurrence.recurrenceIdUtc,
        expectedVersion: null,
        patch,
      })
    } else if (choice === '2') {
      await editSeriesThisAndFollowing({
        seriesId: occurrence.seriesId,
        recurrenceIdUtc: occurrence.recurrenceIdUtc,
        expectedVersion: null,
        patch,
      })
    } else if (choice === '3') {
      await editSeriesAllEvents({
        seriesId: occurrence.seriesId,
        expectedVersion: null,
        patch,
      })
    }

    await refreshOccurrences()
  }

  async function onDeleteOccurrence(occurrence: (typeof occurrences)[number]) {
    if (!window.confirm('Delete this occurrence?')) {
      return
    }

    if (occurrence.sourceType === 'single' || occurrence.sourceType === 'detached') {
      if (occurrence.sessionId === null) {
        return
      }

      await deleteSingle({
        sessionId: occurrence.sessionId,
        expectedVersion: null,
      })
      await refreshOccurrences()
      return
    }

    if (occurrence.seriesId === null || occurrence.recurrenceIdUtc === null) {
      return
    }

    const choice = window.prompt(
      'Delete scope: type 1 for THIS_EVENT, 2 for THIS_AND_FOLLOWING, 3 for ALL_EVENTS',
      '1',
    )

    if (choice === null) {
      return
    }

    if (choice === '1') {
      await deleteSeriesThisEvent({
        seriesId: occurrence.seriesId,
        recurrenceIdUtc: occurrence.recurrenceIdUtc,
        expectedVersion: null,
      })
    } else if (choice === '2') {
      await deleteSeriesThisAndFollowing({
        seriesId: occurrence.seriesId,
        recurrenceIdUtc: occurrence.recurrenceIdUtc,
        expectedVersion: null,
      })
    } else if (choice === '3') {
      await deleteSeriesAllEvents({
        seriesId: occurrence.seriesId,
        expectedVersion: null,
      })
    }

    await refreshOccurrences()
  }

  async function onAddParticipant() {
    if (!selectedOccurrence?.rootSeriesId || selectedParticipant.length === 0) {
      return
    }

    await addParticipantsAllEvents({
      rootSeriesId: selectedOccurrence.rootSeriesId,
      participantUserIds: [selectedParticipant as Id<'users'>],
      role: 'required',
    })

    setSelectedParticipant('')
    if (participantsQueryDescriptor !== null) {
      await queryClient.invalidateQueries({ queryKey: participantsQueryDescriptor.queryKey })
    }
  }

  async function onRemoveParticipant(userId: Id<'users'>) {
    if (!selectedOccurrence?.rootSeriesId) {
      return
    }

    await removeParticipantAllEvents({
      rootSeriesId: selectedOccurrence.rootSeriesId,
      participantUserId: userId,
    })
    if (participantsQueryDescriptor !== null) {
      await queryClient.invalidateQueries({ queryKey: participantsQueryDescriptor.queryKey })
    }
  }

  if (selectedStudio === undefined) {
    return (
      <section className="mx-auto w-full max-w-4xl px-1 py-2">
        <article className="hp-panel border-foreground/12 bg-card p-6 sm:p-8">
          <p className="hp-chip border-foreground/12 bg-background text-muted-foreground">
            Sessions
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

  return (
    <section className="mx-auto w-full max-w-6xl px-1 py-1 sm:py-2">
      <article className="hp-panel border-foreground/12 bg-card p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="hp-chip border-foreground/12 bg-background text-muted-foreground">
              Sessions
            </p>
            <h1 className="mt-3 text-4xl leading-[0.95] font-bold text-foreground sm:text-5xl">
              {selectedStudio.name}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">Manage recurring schedules and participants.</p>
          </div>
          <Link
            to="/studios/$studioId"
            params={{ studioId: selectedStudio._id }}
            className="hp-secondary-btn px-4 py-2"
          >
            Back to dashboard
          </Link>
        </div>
      </article>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <form
          onSubmit={onCreateSubmit}
          className="hp-panel border-foreground/12 bg-card p-5 sm:p-6"
        >
          <h2 className="text-xl font-bold text-foreground">Create session</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-foreground">
              Title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="hp-field mt-1"
                required
              />
            </label>
            <label className="text-sm text-foreground">
              Timezone
              <input
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                className="hp-field mt-1"
                required
              />
            </label>
            <label className="text-sm text-foreground sm:col-span-2">
              Start
              <input
                type="datetime-local"
                value={startAtLocal}
                onChange={(event) => setStartAtLocal(event.target.value)}
                className="hp-field mt-1"
                required
              />
            </label>
            <label className="text-sm text-foreground">
              Duration (minutes)
              <input
                value={durationMinutes}
                onChange={(event) => setDurationMinutes(event.target.value)}
                className="hp-field mt-1"
                required
              />
            </label>
            <label className="text-sm text-foreground">
              Capacity (optional)
              <input
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
                className="hp-field mt-1"
              />
            </label>
            <label className="text-sm text-foreground sm:col-span-2">
              Location
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                className="hp-field mt-1"
              />
            </label>
            <label className="text-sm text-foreground sm:col-span-2">
              Notes
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="hp-field mt-1 min-h-[96px] resize-none"
              />
            </label>
          </div>

          <div className="mt-4 space-y-3 rounded-2xl border border-foreground/12 bg-background p-3">
            <p className="text-sm font-semibold text-foreground">Schedule</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setScheduleKind('single')}
                className={`hp-secondary-btn px-3 py-1.5 text-xs ${scheduleKind === 'single' ? 'bg-accent text-accent-foreground' : ''}`}
              >
                Single
              </button>
              <button
                type="button"
                onClick={() => setScheduleKind('series')}
                className={`hp-secondary-btn px-3 py-1.5 text-xs ${scheduleKind === 'series' ? 'bg-accent text-accent-foreground' : ''}`}
              >
                Recurring
              </button>
            </div>

            {scheduleKind === 'series' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-foreground">
                  Frequency
                  <select
                    value={freq}
                    onChange={(event) => setFreq(event.target.value as 'DAILY' | 'WEEKLY')}
                    className="hp-field mt-1"
                  >
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                  </select>
                </label>
                <label className="text-sm text-foreground">
                  Every
                  <input
                    value={interval}
                    onChange={(event) => setInterval(event.target.value)}
                    className="hp-field mt-1"
                  />
                </label>
                {freq === 'WEEKLY' ? (
                  <div className="sm:col-span-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase">Repeat on</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {weekdayOptions.map((option) => {
                        const active = weeklyDays.includes(option.value)
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              setWeeklyDays((previous) =>
                                previous.includes(option.value)
                                  ? previous.filter((value) => value !== option.value)
                                  : [...previous, option.value],
                              )
                            }}
                            className={`hp-secondary-btn px-2.5 py-1 text-xs ${active ? 'bg-accent text-accent-foreground' : ''}`}
                          >
                            {option.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="mt-4 space-y-3 rounded-2xl border border-foreground/12 bg-background p-3">
            <p className="text-sm font-semibold text-foreground">Participants</p>
            <div className="flex gap-2">
              <select
                value={selectedParticipant}
                onChange={(event) => setSelectedParticipant(event.target.value)}
                className="hp-field"
              >
                <option value="">Select member...</option>
                {studioMembers.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name} ({member.email})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="hp-secondary-btn px-3 py-2"
                onClick={() => {
                  if (selectedParticipant.length === 0) {
                    return
                  }
                  const userId = selectedParticipant as Id<'users'>
                  setParticipantUserIds((previous) =>
                    previous.includes(userId) ? previous : [...previous, userId],
                  )
                  setSelectedParticipant('')
                }}
              >
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {participantUserIds.map((participantUserId) => {
                const member = studioMembers.find((candidate) => candidate.userId === participantUserId)
                if (member === undefined) {
                  return null
                }

                return (
                  <button
                    key={participantUserId}
                    type="button"
                    className="hp-secondary-btn px-2.5 py-1 text-xs"
                    onClick={() =>
                      setParticipantUserIds((previous) =>
                        previous.filter((entry) => entry !== participantUserId),
                      )
                    }
                  >
                    {member.name} ×
                  </button>
                )
              })}
            </div>
          </div>

          {error ? (
            <p className="mt-3 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <button type="submit" disabled={isSaving} className="hp-primary-btn mt-4">
            {isSaving ? 'Saving...' : 'Create session'}
          </button>
        </form>

        <article className="hp-panel border-foreground/12 bg-card p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-foreground/12 pb-4">
            <div>
              <h2 className="text-xl font-bold text-foreground">Occurrences</h2>
              <p className="mt-1 text-sm text-muted-foreground">Scoped edit/delete like Google Calendar.</p>
            </div>
            <div className="text-xs text-muted-foreground">
              {occurrences.length} {occurrences.length === 1 ? 'occurrence' : 'occurrences'}
            </div>
          </div>

          <div className="mt-4 max-h-[460px] space-y-2 overflow-auto pr-1">
            {occurrences.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-foreground/15 bg-background/70 px-4 py-5 text-sm text-muted-foreground">
                No occurrences in this window.
              </p>
            ) : (
              occurrences.map((occurrence) => (
                <article
                  key={occurrence.instanceId}
                  className="rounded-2xl border border-foreground/12 bg-background p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{occurrence.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {occurrenceDateFormatter.format(occurrence.startAtUtc)} · {occurrence.sourceType}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className="hp-secondary-btn px-2.5 py-1 text-xs"
                        onClick={() => {
                          setSelectedOccurrenceKey(occurrence.instanceId)
                        }}
                      >
                        Participants
                      </button>
                      {canManageOccurrence(occurrence) ? (
                        <>
                          <button
                            type="button"
                            className="hp-secondary-btn px-2.5 py-1 text-xs"
                            onClick={() => void onEditOccurrence(occurrence)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="hp-secondary-btn px-2.5 py-1 text-xs"
                            onClick={() => void onDeleteOccurrence(occurrence)}
                          >
                            Delete
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </article>
      </div>

      <article className="hp-panel mt-4 border-foreground/12 bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/12 pb-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">Participant list</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Full list is visible to attendees. Only organizer/studio owner can modify.
            </p>
          </div>
          {selectedOccurrence ? (
            <p className="text-xs text-muted-foreground">
              Viewing: {occurrenceDateFormatter.format(selectedOccurrence.startAtUtc)}
            </p>
          ) : null}
        </div>

        {selectedOccurrence === null || selectedOccurrence.rootSeriesId === null ? (
          <p className="mt-4 rounded-2xl border border-dashed border-foreground/15 bg-background/70 px-4 py-5 text-sm text-muted-foreground">
            Select an occurrence to view participants.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {canManageSelectedOccurrence ? (
              <div className="flex flex-wrap gap-2 rounded-2xl border border-foreground/12 bg-background p-3">
                <select
                  value={selectedParticipant}
                  onChange={(event) => setSelectedParticipant(event.target.value)}
                  className="hp-field"
                >
                  <option value="">Select member...</option>
                  {studioMembers
                    .filter((member) => !existingOccurrenceParticipantSet.has(member.userId))
                    .map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.name} ({member.email})
                      </option>
                    ))}
                </select>
                <button type="button" className="hp-secondary-btn px-3 py-2" onClick={() => void onAddParticipant()}>
                  Add to all events
                </button>
              </div>
            ) : null}

            {participantsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading participants...</p>
            ) : participantsQuery.data === undefined || participantsQuery.data.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-foreground/15 bg-background/70 px-4 py-5 text-sm text-muted-foreground">
                No participants found.
              </p>
            ) : (
              participantsQuery.data.map((participant) => (
                <article
                  key={participant.userId}
                  className="rounded-2xl border border-foreground/12 bg-background px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{participant.name}</p>
                      <p className="text-xs text-muted-foreground">{participant.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-foreground/12 px-2 py-0.5 text-[11px] font-semibold uppercase text-muted-foreground">
                        {participant.role}
                      </span>
                      {canManageSelectedOccurrence && !participant.isOrganizer ? (
                        <button
                          type="button"
                          className="hp-secondary-btn px-2.5 py-1 text-xs"
                          onClick={() => void onRemoveParticipant(participant.userId)}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        )}
      </article>
    </section>
  )
}

function toDatetimeLocal(value: Date) {
  const pad = (input: number) => input.toString().padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(
    value.getHours(),
  )}:${pad(value.getMinutes())}`
}
