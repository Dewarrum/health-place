import type { Doc, Id } from './_generated/dataModel'
import { internalMutation, type MutationCtx, type QueryCtx } from './_generated/server'
import { v } from 'convex/values'
import {
  type ExpandedOccurrence,
  generateSeriesOccurrencesInWindow,
  getLocalDateTime,
  localDateTimeToUtc,
} from './lib/recurrence'
import type { LocalDateTime, SeriesRule } from './sessionsTypes'
import { assertStudioMember } from './lib/authz'

const PROJECTION_PAST_MONTHS = 3
const PROJECTION_FUTURE_MONTHS = 12

type OccurrenceRowInput = {
  studioId: Id<'studios'>
  organizerId: Id<'users'>
  sourceType: 'single' | 'detached' | 'recurring_generated'
  sessionId: Id<'sessions'> | null
  seriesId: Id<'sessions'> | null
  rootSeriesId: Id<'sessions'> | null
  recurrenceIdUtc: number | null
  startAtUtc: number
  endAtUtc: number
  timezone: string
  title: string
  notes: string | null
  location: string | null
  capacity: number | null
  isCancelled: boolean
  generationVersion: number
  generatedAt: number
}

export function projectionWindowFor(now: number) {
  const start = new Date(now)
  start.setUTCMonth(start.getUTCMonth() - PROJECTION_PAST_MONTHS)

  const end = new Date(now)
  end.setUTCMonth(end.getUTCMonth() + PROJECTION_FUTURE_MONTHS)

  return {
    startUtc: start.getTime(),
    endUtc: end.getTime(),
  }
}

export async function regenerateWindowForStudio(
  ctx: MutationCtx,
  args: {
    studioId: Id<'studios'>
    windowStartUtc: number
    windowEndUtc: number
    generationVersion: number
  },
) {
  const { windowStartUtc, windowEndUtc } = args

  const existing = await ctx.db
    .query('sessionOccurrences')
    .withIndex('by_studio_id_and_start_at_utc', (q) =>
      q.eq('studioId', args.studioId).gte('startAtUtc', windowStartUtc).lte('startAtUtc', windowEndUtc),
    )
    .collect()

  await Promise.all(existing.map((row) => ctx.db.delete(row._id)))

  const rows = await listCanonicalStudioOccurrencesWindow(ctx, {
    studioId: args.studioId,
    windowStartUtc,
    windowEndUtc,
    generationVersion: args.generationVersion,
    generatedAt: Date.now(),
  })

  await Promise.all(rows.map((row) => ctx.db.insert('sessionOccurrences', row)))
}

export async function regenerateWindowForSeries(
  ctx: MutationCtx,
  args: {
    seriesId: Id<'sessions'>
    windowStartUtc: number
    windowEndUtc: number
    generationVersion: number
  },
) {
  const series = await ctx.db.get(args.seriesId)
  if (series === null) {
    return
  }

  await regenerateWindowForStudio(ctx, {
    studioId: series.studioId,
    windowStartUtc: args.windowStartUtc,
    windowEndUtc: args.windowEndUtc,
    generationVersion: args.generationVersion,
  })
}

export async function listCanonicalStudioOccurrencesWindow(
  ctx: QueryCtx | MutationCtx,
  args: {
    studioId: Id<'studios'>
    windowStartUtc: number
    windowEndUtc: number
    generationVersion: number
    generatedAt: number
  },
): Promise<Array<OccurrenceRowInput>> {
  const sessions = await ctx.db
    .query('sessions')
    .withIndex('by_studio_id_and_status', (q) =>
      q.eq('studioId', args.studioId).eq('status', 'active'),
    )
    .collect()

  const rows: Array<OccurrenceRowInput> = []

  for (const session of sessions) {
    if (session.type === 'single' || session.type === 'detached') {
      if (session.startAtUtc < args.windowStartUtc || session.startAtUtc > args.windowEndUtc) {
        continue
      }

      rows.push({
        studioId: session.studioId,
        organizerId: session.organizerId,
        sourceType: session.type,
        sessionId: session._id,
        seriesId: session.type === 'detached' ? session.splitFromSeriesId : null,
        rootSeriesId: session.rootSeriesId,
        recurrenceIdUtc: session.type === 'detached' ? session.startAtUtc : null,
        startAtUtc: session.startAtUtc,
        endAtUtc: session.endAtUtc,
        timezone: session.timezone,
        title: session.title,
        notes: session.notes,
        location: session.location,
        capacity: session.capacity,
        isCancelled: false,
        generationVersion: args.generationVersion,
        generatedAt: args.generatedAt,
      })

      continue
    }

    if (session.seriesRule === null || session.seriesAnchorLocal === null) {
      continue
    }

    const exceptionRows = await ctx.db
      .query('sessionExceptions')
      .withIndex('by_series_id', (q) => q.eq('seriesId', session._id))
      .collect()

    const exceptionByRecurrence = new Map<number, Doc<'sessionExceptions'>>()
    for (const exception of exceptionRows) {
      exceptionByRecurrence.set(exception.recurrenceIdUtc, exception)
    }

    const expanded = expandSeriesIntoWindow({
      series: session,
      windowStartUtc: args.windowStartUtc,
      windowEndUtc: args.windowEndUtc,
    })

    for (const occurrence of expanded) {
      const exception = exceptionByRecurrence.get(occurrence.recurrenceIdUtc)
      const resolved = resolveOccurrencePayload({
        series: session,
        occurrence,
        exception,
      })

      if (resolved.isCancelled) {
        continue
      }

      rows.push({
        studioId: session.studioId,
        organizerId: session.organizerId,
        sourceType: 'recurring_generated',
        sessionId: null,
        seriesId: session._id,
        rootSeriesId: session.rootSeriesId,
        recurrenceIdUtc: occurrence.recurrenceIdUtc,
        startAtUtc: resolved.startAtUtc,
        endAtUtc: resolved.endAtUtc,
        timezone: resolved.timezone,
        title: resolved.title,
        notes: resolved.notes,
        location: resolved.location,
        capacity: resolved.capacity,
        isCancelled: false,
        generationVersion: args.generationVersion,
        generatedAt: args.generatedAt,
      })
    }
  }

  rows.sort((a, b) => a.startAtUtc - b.startAtUtc)
  return rows
}

export function expandSeriesIntoWindow(args: {
  series: Doc<'sessions'>
  windowStartUtc: number
  windowEndUtc: number
}): Array<ExpandedOccurrence> {
  if (args.series.type !== 'series') {
    return []
  }
  if (args.series.seriesRule === null || args.series.seriesAnchorLocal === null) {
    return []
  }

  return generateSeriesOccurrencesInWindow({
    anchorStartAtUtc: args.series.startAtUtc,
    durationMinutes: args.series.durationMinutes,
    timezone: args.series.timezone,
    rule: args.series.seriesRule as SeriesRule,
    anchorLocal: args.series.seriesAnchorLocal as LocalDateTime,
    windowStartUtc: args.windowStartUtc,
    windowEndUtc: args.windowEndUtc,
  })
}

export function resolveOccurrencePayload(args: {
  series: Doc<'sessions'>
  occurrence: ExpandedOccurrence
  exception: Doc<'sessionExceptions'> | undefined
}) {
  const base = {
    startAtUtc: args.occurrence.startAtUtc,
    endAtUtc: args.occurrence.endAtUtc,
    timezone: args.series.timezone,
    title: args.series.title,
    notes: args.series.notes,
    location: args.series.location,
    capacity: args.series.capacity,
    isCancelled: false,
  }

  if (args.exception === undefined) {
    return base
  }

  if (args.exception.kind === 'cancel') {
    return {
      ...base,
      isCancelled: true,
    }
  }

  if (args.exception.detachedSessionId !== null) {
    return {
      ...base,
      isCancelled: true,
    }
  }

  if (args.exception.overridePayload === null) {
    return base
  }

  const payload = args.exception.overridePayload
  return {
    startAtUtc: payload.startAtUtc ?? base.startAtUtc,
    endAtUtc: payload.endAtUtc ?? base.endAtUtc,
    timezone: base.timezone,
    title: payload.title ?? base.title,
    notes: payload.notes ?? base.notes,
    location: payload.location ?? base.location,
    capacity: payload.capacity ?? base.capacity,
    isCancelled: false,
  }
}

export async function applyExceptionRemapFallback(
  ctx: MutationCtx,
  args: {
    oldSeries: Doc<'sessions'>
    exception: Doc<'sessionExceptions'>
    actorId: Id<'users'>
  },
): Promise<Id<'sessions'> | null> {
  if (args.exception.kind !== 'override') {
    return null
  }

  if (args.exception.detachedSessionId !== null) {
    return args.exception.detachedSessionId
  }

  const payload = args.exception.overridePayload
  const startAtUtc = payload?.startAtUtc ?? args.exception.recurrenceIdUtc
  const duration = payload?.durationMinutes ?? args.oldSeries.durationMinutes
  const endAtUtc = payload?.endAtUtc ?? startAtUtc + duration * 60_000

  const now = Date.now()
  const detachedSessionId = await ctx.db.insert('sessions', {
    studioId: args.oldSeries.studioId,
    organizerId: args.oldSeries.organizerId,
    type: 'detached',
    status: 'active',
    title: payload?.title ?? args.oldSeries.title,
    notes: payload?.notes ?? args.oldSeries.notes,
    location: payload?.location ?? args.oldSeries.location,
    capacity: payload?.capacity ?? args.oldSeries.capacity,
    timezone: args.oldSeries.timezone,
    startAtUtc,
    endAtUtc,
    durationMinutes: Math.max(1, Math.round((endAtUtc - startAtUtc) / 60_000)),
    seriesRule: null,
    seriesAnchorLocal: getLocalDateTime(startAtUtc, args.oldSeries.timezone),
    rootSeriesId: args.oldSeries.rootSeriesId,
    splitFromSeriesId: args.oldSeries._id,
    version: 1,
    createdBy: args.actorId,
    updatedBy: args.actorId,
    createdAt: now,
    updatedAt: now,
  })

  await ctx.db.patch(args.exception._id, {
    detachedSessionId,
    updatedBy: args.actorId,
    updatedAt: now,
    version: args.exception.version + 1,
  })

  return detachedSessionId
}

export function mapRecurrenceFromLocalDate(args: {
  series: Doc<'sessions'>
  localDate: LocalDateTime
}): number | null {
  if (args.series.seriesRule === null || args.series.seriesAnchorLocal === null) {
    return null
  }

  const localStart = {
    year: args.localDate.year,
    month: args.localDate.month,
    day: args.localDate.day,
    hour: args.series.seriesAnchorLocal.hour,
    minute: args.series.seriesAnchorLocal.minute,
  }

  const recurrenceIdUtc = localDateTimeToUtc(localStart, args.series.timezone)
  const oneDayMs = 24 * 60 * 60 * 1000
  const windowStartUtc = recurrenceIdUtc - oneDayMs
  const windowEndUtc = recurrenceIdUtc + oneDayMs

  const expanded = expandSeriesIntoWindow({
    series: args.series,
    windowStartUtc,
    windowEndUtc,
  })

  const matched = expanded.find((occurrence) => {
    const local = getLocalDateTime(occurrence.startAtUtc, args.series.timezone)
    return (
      local.year === args.localDate.year &&
      local.month === args.localDate.month &&
      local.day === args.localDate.day
    )
  })

  return matched?.recurrenceIdUtc ?? null
}

export const backfillSessionOccurrences = internalMutation({
  args: {
    studioId: v.union(v.id('studios'), v.null()),
  },
  handler: async (ctx, args) => {
    const generationVersion = Date.now()
    const now = Date.now()
    const projectionWindow = projectionWindowFor(now)

    if (args.studioId !== null) {
      await assertStudioMember(ctx, args.studioId)
      await regenerateWindowForStudio(ctx, {
        studioId: args.studioId,
        windowStartUtc: projectionWindow.startUtc,
        windowEndUtc: projectionWindow.endUtc,
        generationVersion,
      })

      return {
        refreshedStudios: 1,
      }
    }

    const studios = await ctx.db.query('studios').collect()
    for (const studio of studios) {
      await regenerateWindowForStudio(ctx, {
        studioId: studio._id,
        windowStartUtc: projectionWindow.startUtc,
        windowEndUtc: projectionWindow.endUtc,
        generationVersion,
      })
    }

    return {
      refreshedStudios: studios.length,
    }
  },
})
