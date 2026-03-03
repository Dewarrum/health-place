import type { Doc, Id } from './_generated/dataModel'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { v } from 'convex/values'
import {
  assertCanManageSession,
  assertCanViewParticipants,
  assertStudioMember,
} from './lib/authz'
import {
  getLocalDateTime,
  localDateTimeToUtc,
  toLocalDateKey,
} from './lib/recurrence'
import {
  applyExceptionRemapFallback,
  expandSeriesIntoWindow,
  listCanonicalStudioOccurrencesWindow,
  mapRecurrenceFromLocalDate,
  projectionWindowFor,
  regenerateWindowForStudio,
} from './sessionsInternal'
import {
  localDateTimeValidator,
  seriesRuleValidator,
  sessionPatchValidator,
  type LocalDateTime,
  type SeriesRule,
  type SessionPatch,
} from './sessionsTypes'

export const createSingle = mutation({
  args: {
    studioId: v.id('studios'),
    title: v.string(),
    notes: v.union(v.string(), v.null()),
    location: v.union(v.string(), v.null()),
    capacity: v.union(v.number(), v.null()),
    timezone: v.string(),
    startAtUtc: v.number(),
    durationMinutes: v.number(),
    participantUserIds: v.array(v.id('users')),
  },
  handler: async (ctx, args) => {
    const { userId } = await assertStudioMember(ctx, args.studioId)

    const now = Date.now()
    const title = args.title.trim()
    if (title.length === 0) {
      throw new Error('Session title is required.')
    }

    const durationMinutes = normalizeDuration(args.durationMinutes)
    const sessionId = await ctx.db.insert('sessions', {
      studioId: args.studioId,
      organizerId: userId,
      type: 'single',
      status: 'active',
      title,
      notes: normalizeText(args.notes),
      location: normalizeText(args.location),
      capacity: normalizeCapacity(args.capacity),
      timezone: args.timezone,
      startAtUtc: args.startAtUtc,
      endAtUtc: args.startAtUtc + durationMinutes * 60_000,
      durationMinutes,
      seriesRule: null,
      seriesAnchorLocal: getLocalDateTime(args.startAtUtc, args.timezone),
      rootSeriesId: null,
      splitFromSeriesId: null,
      version: 1,
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.patch(sessionId, {
      rootSeriesId: sessionId,
      updatedAt: now,
    })

    await upsertParticipantsForAllEvents(ctx, {
      studioId: args.studioId,
      rootSeriesId: sessionId,
      organizerId: userId,
      actorId: userId,
      participantUserIds: args.participantUserIds,
    })

    await regenerateStudioProjection(ctx, args.studioId)

    return {
      sessionId,
    }
  },
})

export const createSeries = mutation({
  args: {
    studioId: v.id('studios'),
    title: v.string(),
    notes: v.union(v.string(), v.null()),
    location: v.union(v.string(), v.null()),
    capacity: v.union(v.number(), v.null()),
    timezone: v.string(),
    startAtUtc: v.number(),
    durationMinutes: v.number(),
    rule: seriesRuleValidator,
    anchorLocal: v.union(localDateTimeValidator, v.null()),
    participantUserIds: v.array(v.id('users')),
  },
  handler: async (ctx, args) => {
    const { userId } = await assertStudioMember(ctx, args.studioId)

    const title = args.title.trim()
    if (title.length === 0) {
      throw new Error('Session title is required.')
    }

    if (args.rule.count !== null && args.rule.untilUtc !== null) {
      throw new Error('Series rule cannot include both count and until.')
    }

    const durationMinutes = normalizeDuration(args.durationMinutes)
    const now = Date.now()
    const seriesAnchorLocal = args.anchorLocal ?? getLocalDateTime(args.startAtUtc, args.timezone)

    const sessionId = await ctx.db.insert('sessions', {
      studioId: args.studioId,
      organizerId: userId,
      type: 'series',
      status: 'active',
      title,
      notes: normalizeText(args.notes),
      location: normalizeText(args.location),
      capacity: normalizeCapacity(args.capacity),
      timezone: args.timezone,
      startAtUtc: args.startAtUtc,
      endAtUtc: args.startAtUtc + durationMinutes * 60_000,
      durationMinutes,
      seriesRule: {
        ...args.rule,
        interval: Math.max(1, Math.floor(args.rule.interval)),
      },
      seriesAnchorLocal,
      rootSeriesId: null,
      splitFromSeriesId: null,
      version: 1,
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.patch(sessionId, {
      rootSeriesId: sessionId,
      updatedAt: now,
    })

    await upsertParticipantsForAllEvents(ctx, {
      studioId: args.studioId,
      rootSeriesId: sessionId,
      organizerId: userId,
      actorId: userId,
      participantUserIds: args.participantUserIds,
    })

    await regenerateStudioProjection(ctx, args.studioId)

    return {
      seriesId: sessionId,
    }
  },
})

export const editSingle = mutation({
  args: {
    sessionId: v.id('sessions'),
    expectedVersion: v.union(v.number(), v.null()),
    patch: sessionPatchValidator,
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId)
    if (session === null) {
      throw new Error('Session not found.')
    }
    if (session.type === 'series') {
      throw new Error('Use series edit mutations for recurring sessions.')
    }

    const { userId } = await assertCanManageSession(ctx, session)
    assertVersion(session.version, args.expectedVersion)

    const patch = normalizePatch(args.patch)
    const updated = applySingleLikePatch(session, patch)

    await ctx.db.patch(session._id, {
      ...updated,
      version: session.version + 1,
      updatedBy: userId,
      updatedAt: Date.now(),
    })

    await regenerateStudioProjection(ctx, session.studioId)

    return {
      sessionId: session._id,
      version: session.version + 1,
    }
  },
})

export const editSeriesThisEvent = mutation({
  args: {
    seriesId: v.id('sessions'),
    recurrenceIdUtc: v.number(),
    expectedVersion: v.union(v.number(), v.null()),
    patch: sessionPatchValidator,
  },
  handler: async (ctx, args) => {
    const series = await getActiveSeries(ctx, args.seriesId)
    const { userId } = await assertCanManageSession(ctx, series)
    assertVersion(series.version, args.expectedVersion)
    assertOccurrenceExists(series, args.recurrenceIdUtc)

    const existingException = await ctx.db
      .query('sessionExceptions')
      .withIndex('by_series_id_and_recurrence_id_utc', (q) =>
        q.eq('seriesId', series._id).eq('recurrenceIdUtc', args.recurrenceIdUtc),
      )
      .unique()

    if (existingException?.kind === 'cancel') {
      throw new Error('Cannot edit a canceled occurrence.')
    }

    const patch = normalizePatch(args.patch)
    const occurrenceLocal = getLocalDateTime(args.recurrenceIdUtc, series.timezone)
    const detachedPayload = deriveDetachedPayloadFromOccurrence({
      series,
      occurrenceStartUtc: args.recurrenceIdUtc,
      occurrenceLocal,
      patch,
    })

    const now = Date.now()
    let detachedSessionId: Id<'sessions'>

    if (existingException !== null && existingException.detachedSessionId !== null) {
      const detachedSession = await ctx.db.get(existingException.detachedSessionId)
      if (detachedSession === null) {
        throw new Error('Detached session not found.')
      }

      const detachedPatch = applySingleLikePatch(detachedSession, patch)
      await ctx.db.patch(detachedSession._id, {
        ...detachedPatch,
        version: detachedSession.version + 1,
        updatedBy: userId,
        updatedAt: now,
      })
      detachedSessionId = detachedSession._id
    } else {
      detachedSessionId = await ctx.db.insert('sessions', {
        studioId: series.studioId,
        organizerId: series.organizerId,
        type: 'detached',
        status: 'active',
        title: detachedPayload.title,
        notes: detachedPayload.notes,
        location: detachedPayload.location,
        capacity: detachedPayload.capacity,
        timezone: detachedPayload.timezone,
        startAtUtc: detachedPayload.startAtUtc,
        endAtUtc: detachedPayload.endAtUtc,
        durationMinutes: detachedPayload.durationMinutes,
        seriesRule: null,
        seriesAnchorLocal: getLocalDateTime(detachedPayload.startAtUtc, detachedPayload.timezone),
        rootSeriesId: series.rootSeriesId,
        splitFromSeriesId: series._id,
        version: 1,
        createdBy: userId,
        updatedBy: userId,
        createdAt: now,
        updatedAt: now,
      })
    }

    if (existingException === null) {
      await ctx.db.insert('sessionExceptions', {
        seriesId: series._id,
        recurrenceIdUtc: args.recurrenceIdUtc,
        originalLocalStart: occurrenceLocal,
        kind: 'override',
        overridePayload: null,
        detachedSessionId,
        version: 1,
        createdBy: userId,
        updatedBy: userId,
        createdAt: now,
        updatedAt: now,
      })
    } else {
      await ctx.db.patch(existingException._id, {
        kind: 'override',
        detachedSessionId,
        overridePayload: null,
        version: existingException.version + 1,
        updatedBy: userId,
        updatedAt: now,
      })
    }

    await regenerateStudioProjection(ctx, series.studioId)

    return {
      detachedSessionId,
      recurrenceIdUtc: args.recurrenceIdUtc,
    }
  },
})

export const editSeriesThisAndFollowing = mutation({
  args: {
    seriesId: v.id('sessions'),
    recurrenceIdUtc: v.number(),
    expectedVersion: v.union(v.number(), v.null()),
    patch: sessionPatchValidator,
  },
  handler: async (ctx, args) => {
    const series = await getActiveSeries(ctx, args.seriesId)
    const { userId } = await assertCanManageSession(ctx, series)
    assertVersion(series.version, args.expectedVersion)
    assertOccurrenceExists(series, args.recurrenceIdUtc)

    if (args.recurrenceIdUtc <= series.startAtUtc) {
      return await applySeriesAllEventsPatch(ctx, {
        series,
        actorId: userId,
        patch: normalizePatch(args.patch),
      })
    }

    const patch = normalizePatch(args.patch)
    const now = Date.now()
    const oldRule = requireSeriesRule(series)
    const lastOccurrenceUtc = findSeriesLastOccurrenceUtc(series)

    const truncatedUntil = Math.min(
      args.recurrenceIdUtc - 1,
      lastOccurrenceUtc ?? Number.POSITIVE_INFINITY,
    )

    await ctx.db.patch(series._id, {
      seriesRule: {
        ...oldRule,
        count: null,
        untilUtc: Number.isFinite(truncatedUntil) ? truncatedUntil : oldRule.untilUtc,
      },
      version: series.version + 1,
      updatedBy: userId,
      updatedAt: now,
    })

    const recurrenceLocal = getLocalDateTime(args.recurrenceIdUtc, series.timezone)
    const newTimezone = patch.timezone ?? series.timezone
    const newAnchorLocal = {
      ...recurrenceLocal,
      hour: patch.startLocalHour ?? recurrenceLocal.hour,
      minute: patch.startLocalMinute ?? recurrenceLocal.minute,
    }
    const newStartAtUtc =
      patch.startAtUtc ?? localDateTimeToUtc(newAnchorLocal, newTimezone)
    const newDuration = patch.durationMinutes ?? series.durationMinutes
    const newSeriesId = await ctx.db.insert('sessions', {
      studioId: series.studioId,
      organizerId: series.organizerId,
      type: 'series',
      status: 'active',
      title: patch.title ?? series.title,
      notes: patch.notes ?? series.notes,
      location: patch.location ?? series.location,
      capacity: patch.capacity ?? series.capacity,
      timezone: newTimezone,
      startAtUtc: newStartAtUtc,
      endAtUtc: newStartAtUtc + newDuration * 60_000,
      durationMinutes: newDuration,
      seriesRule: {
        ...oldRule,
        count: null,
        untilUtc: lastOccurrenceUtc,
      },
      seriesAnchorLocal: newAnchorLocal,
      rootSeriesId: series.rootSeriesId,
      splitFromSeriesId: series._id,
      version: 1,
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
    })

    const warnings: Array<{ type: string; message: string; recurrenceIdUtc: number }> = []
    const futureExceptions = await ctx.db
      .query('sessionExceptions')
      .withIndex('by_series_id', (q) => q.eq('seriesId', series._id))
      .collect()

    const newSeries = await ctx.db.get(newSeriesId)
    if (newSeries === null) {
      throw new Error('Failed to create split series.')
    }

    for (const exception of futureExceptions) {
      if (exception.recurrenceIdUtc < args.recurrenceIdUtc) {
        continue
      }

      const mappedRecurrence = mapRecurrenceFromLocalDate({
        series: newSeries,
        localDate: exception.originalLocalStart,
      })

      if (mappedRecurrence === null) {
        const detachedSessionId = await applyExceptionRemapFallback(ctx, {
          oldSeries: series,
          exception,
          actorId: userId,
        })

        warnings.push({
          type: detachedSessionId === null ? 'exception_skipped' : 'detached_preserved',
          message:
            detachedSessionId === null
              ? 'Could not map exception to split series.'
              : 'Exception preserved as detached session.',
          recurrenceIdUtc: exception.recurrenceIdUtc,
        })

        continue
      }

      const existingMapped = await ctx.db
        .query('sessionExceptions')
        .withIndex('by_series_id_and_recurrence_id_utc', (q) =>
          q.eq('seriesId', newSeriesId).eq('recurrenceIdUtc', mappedRecurrence),
        )
        .unique()

      if (existingMapped !== null) {
        continue
      }

      await ctx.db.insert('sessionExceptions', {
        seriesId: newSeriesId,
        recurrenceIdUtc: mappedRecurrence,
        originalLocalStart: {
          ...exception.originalLocalStart,
          hour: newSeries.seriesAnchorLocal?.hour ?? exception.originalLocalStart.hour,
          minute: newSeries.seriesAnchorLocal?.minute ?? exception.originalLocalStart.minute,
        },
        kind: exception.kind,
        overridePayload: exception.overridePayload,
        detachedSessionId: exception.detachedSessionId,
        version: 1,
        createdBy: userId,
        updatedBy: userId,
        createdAt: now,
        updatedAt: now,
      })
    }

    await regenerateStudioProjection(ctx, series.studioId)

    return {
      oldSeriesId: series._id,
      newSeriesId,
      warnings,
    }
  },
})

export const editSeriesAllEvents = mutation({
  args: {
    seriesId: v.id('sessions'),
    expectedVersion: v.union(v.number(), v.null()),
    patch: sessionPatchValidator,
  },
  handler: async (ctx, args) => {
    const series = await getActiveSeries(ctx, args.seriesId)
    const { userId } = await assertCanManageSession(ctx, series)
    assertVersion(series.version, args.expectedVersion)

    return await applySeriesAllEventsPatch(ctx, {
      series,
      actorId: userId,
      patch: normalizePatch(args.patch),
    })
  },
})

export const deleteSingle = mutation({
  args: {
    sessionId: v.id('sessions'),
    expectedVersion: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId)
    if (session === null) {
      throw new Error('Session not found.')
    }
    if (session.type === 'series') {
      throw new Error('Use series delete mutations for recurring sessions.')
    }

    const { userId } = await assertCanManageSession(ctx, session)
    assertVersion(session.version, args.expectedVersion)

    await ctx.db.patch(session._id, {
      status: 'deleted',
      version: session.version + 1,
      updatedBy: userId,
      updatedAt: Date.now(),
    })

    await regenerateStudioProjection(ctx, session.studioId)

    return {
      sessionId: session._id,
      version: session.version + 1,
    }
  },
})

export const deleteSeriesThisEvent = mutation({
  args: {
    seriesId: v.id('sessions'),
    recurrenceIdUtc: v.number(),
    expectedVersion: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const series = await getActiveSeries(ctx, args.seriesId)
    const { userId } = await assertCanManageSession(ctx, series)
    assertVersion(series.version, args.expectedVersion)
    assertOccurrenceExists(series, args.recurrenceIdUtc)

    const existingException = await ctx.db
      .query('sessionExceptions')
      .withIndex('by_series_id_and_recurrence_id_utc', (q) =>
        q.eq('seriesId', series._id).eq('recurrenceIdUtc', args.recurrenceIdUtc),
      )
      .unique()

    const now = Date.now()
    const occurrenceLocal = getLocalDateTime(args.recurrenceIdUtc, series.timezone)

    if (existingException !== null && existingException.detachedSessionId !== null) {
      const detachedSession = await ctx.db.get(existingException.detachedSessionId)
      if (detachedSession !== null) {
        await ctx.db.patch(detachedSession._id, {
          status: 'deleted',
          version: detachedSession.version + 1,
          updatedBy: userId,
          updatedAt: now,
        })
      }
    }

    if (existingException === null) {
      await ctx.db.insert('sessionExceptions', {
        seriesId: series._id,
        recurrenceIdUtc: args.recurrenceIdUtc,
        originalLocalStart: occurrenceLocal,
        kind: 'cancel',
        overridePayload: null,
        detachedSessionId: null,
        version: 1,
        createdBy: userId,
        updatedBy: userId,
        createdAt: now,
        updatedAt: now,
      })
    } else {
      await ctx.db.patch(existingException._id, {
        kind: 'cancel',
        detachedSessionId: null,
        overridePayload: null,
        version: existingException.version + 1,
        updatedBy: userId,
        updatedAt: now,
      })
    }

    await regenerateStudioProjection(ctx, series.studioId)

    return {
      seriesId: series._id,
      recurrenceIdUtc: args.recurrenceIdUtc,
    }
  },
})

export const deleteSeriesThisAndFollowing = mutation({
  args: {
    seriesId: v.id('sessions'),
    recurrenceIdUtc: v.number(),
    expectedVersion: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const series = await getActiveSeries(ctx, args.seriesId)
    const { userId } = await assertCanManageSession(ctx, series)
    assertVersion(series.version, args.expectedVersion)

    if (args.recurrenceIdUtc <= series.startAtUtc) {
      return await performDeleteSeriesAllEvents(ctx, {
        series,
        actorId: userId,
      })
    }

    const oldRule = requireSeriesRule(series)
    const untilUtc = oldRule.untilUtc === null
      ? args.recurrenceIdUtc - 1
      : Math.min(oldRule.untilUtc, args.recurrenceIdUtc - 1)

    await ctx.db.patch(series._id, {
      seriesRule: {
        ...oldRule,
        count: null,
        untilUtc,
      },
      version: series.version + 1,
      updatedBy: userId,
      updatedAt: Date.now(),
    })

    await regenerateStudioProjection(ctx, series.studioId)

    return {
      seriesId: series._id,
      version: series.version + 1,
    }
  },
})

export const deleteSeriesAllEvents = mutation({
  args: {
    seriesId: v.id('sessions'),
    expectedVersion: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const series = await getActiveSeries(ctx, args.seriesId)
    const { userId } = await assertCanManageSession(ctx, series)
    assertVersion(series.version, args.expectedVersion)

    return await performDeleteSeriesAllEvents(ctx, {
      series,
      actorId: userId,
    })
  },
})

export const listOccurrencesWindow = query({
  args: {
    studioId: v.id('studios'),
    windowStartUtc: v.number(),
    windowEndUtc: v.number(),
  },
  handler: async (ctx, args) => {
    await assertStudioMember(ctx, args.studioId)

    const now = Date.now()
    const projectionWindow = projectionWindowFor(now)
    const insideProjection =
      args.windowStartUtc >= projectionWindow.startUtc &&
      args.windowEndUtc <= projectionWindow.endUtc

    const rows = insideProjection
      ? await ctx.db
          .query('sessionOccurrences')
          .withIndex('by_studio_id_and_start_at_utc', (q) =>
            q
              .eq('studioId', args.studioId)
              .gte('startAtUtc', args.windowStartUtc)
              .lte('startAtUtc', args.windowEndUtc),
          )
          .collect()
      : await listCanonicalStudioOccurrencesWindow(ctx, {
          studioId: args.studioId,
          windowStartUtc: args.windowStartUtc,
          windowEndUtc: args.windowEndUtc,
          generationVersion: now,
          generatedAt: now,
        })

    return rows
      .filter((row) => !row.isCancelled)
      .map((row) => ({
        instanceId:
          row.sourceType === 'recurring_generated'
            ? `rec:${row.seriesId}:${row.recurrenceIdUtc}`
            : row.sourceType === 'detached'
              ? `det:${row.sessionId}`
              : `single:${row.sessionId}`,
        studioId: row.studioId,
        organizerId: row.organizerId,
        sourceType: row.sourceType,
        sessionId: row.sessionId,
        seriesId: row.seriesId,
        rootSeriesId: row.rootSeriesId,
        recurrenceIdUtc: row.recurrenceIdUtc,
        startAtUtc: row.startAtUtc,
        endAtUtc: row.endAtUtc,
        timezone: row.timezone,
        title: row.title,
        notes: row.notes,
        location: row.location,
        capacity: row.capacity,
      }))
  },
})

export const getOccurrence = query({
  args: {
    studioId: v.id('studios'),
    sessionId: v.union(v.id('sessions'), v.null()),
    seriesId: v.union(v.id('sessions'), v.null()),
    recurrenceIdUtc: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    await assertStudioMember(ctx, args.studioId)

    if (args.sessionId !== null) {
      const session = await ctx.db.get(args.sessionId)
      if (session === null || session.studioId !== args.studioId || session.status !== 'active') {
        return null
      }

      return {
        sourceType: session.type,
        sessionId: session._id,
        seriesId: session.type === 'series' ? session._id : session.splitFromSeriesId,
        rootSeriesId: session.rootSeriesId,
        recurrenceIdUtc: session.type === 'series' ? session.startAtUtc : null,
        startAtUtc: session.startAtUtc,
        endAtUtc: session.endAtUtc,
        timezone: session.timezone,
        title: session.title,
        notes: session.notes,
        location: session.location,
        capacity: session.capacity,
      }
    }

    if (args.seriesId === null || args.recurrenceIdUtc === null) {
      throw new Error('Either sessionId or (seriesId + recurrenceIdUtc) is required.')
    }

    const series = await getActiveSeries(ctx, args.seriesId)
    if (series.studioId !== args.studioId) {
      throw new Error('Occurrence not found.')
    }

    const exception = await ctx.db
      .query('sessionExceptions')
      .withIndex('by_series_id_and_recurrence_id_utc', (q) =>
        q.eq('seriesId', series._id).eq('recurrenceIdUtc', args.recurrenceIdUtc!),
      )
      .unique()

    if (exception?.kind === 'cancel') {
      return null
    }

    if (exception !== null && exception.detachedSessionId !== null) {
      const detached = await ctx.db.get(exception.detachedSessionId)
      if (detached === null || detached.status !== 'active') {
        return null
      }

      return {
        sourceType: 'detached',
        sessionId: detached._id,
        seriesId: detached.splitFromSeriesId,
        rootSeriesId: detached.rootSeriesId,
        recurrenceIdUtc: args.recurrenceIdUtc,
        startAtUtc: detached.startAtUtc,
        endAtUtc: detached.endAtUtc,
        timezone: detached.timezone,
        title: detached.title,
        notes: detached.notes,
        location: detached.location,
        capacity: detached.capacity,
      }
    }

    return {
      sourceType: 'recurring_generated',
      sessionId: null,
      seriesId: series._id,
      rootSeriesId: series.rootSeriesId,
      recurrenceIdUtc: args.recurrenceIdUtc,
      startAtUtc: args.recurrenceIdUtc,
      endAtUtc: args.recurrenceIdUtc + series.durationMinutes * 60_000,
      timezone: series.timezone,
      title: exception?.overridePayload?.title ?? series.title,
      notes: exception?.overridePayload?.notes ?? series.notes,
      location: exception?.overridePayload?.location ?? series.location,
      capacity: exception?.overridePayload?.capacity ?? series.capacity,
    }
  },
})

export const listParticipantsForOccurrence = query({
  args: {
    rootSeriesId: v.id('sessions'),
    recurrenceIdUtc: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const { userId } = await assertCanViewParticipants(ctx, {
      rootSeriesId: args.rootSeriesId,
      recurrenceIdUtc: args.recurrenceIdUtc,
    })

    const rootSession = await ctx.db.get(args.rootSeriesId)
    if (rootSession === null) {
      throw new Error('Session not found.')
    }

    const baseParticipants = await ctx.db
      .query('sessionParticipants')
      .withIndex('by_root_series_id', (q) => q.eq('rootSeriesId', args.rootSeriesId))
      .collect()

    const participantMap = new Map<Id<'users'>, {
      participantUserId: Id<'users'>
      role: 'organizer' | 'required' | 'optional'
      participantStatus: 'active' | 'removed'
      defaultRsvp: 'needsAction' | 'yes' | 'no' | 'maybe'
    }>()

    for (const participant of baseParticipants) {
      if (participant.participantUserId === null) {
        continue
      }

      participantMap.set(participant.participantUserId, {
        participantUserId: participant.participantUserId,
        role: participant.role,
        participantStatus: participant.participantStatus,
        defaultRsvp: participant.defaultRsvp,
      })
    }

    if (args.recurrenceIdUtc !== null) {
      const exceptions = await ctx.db
        .query('sessionParticipantExceptions')
        .withIndex('by_root_series_id_and_recurrence_id_utc', (q) =>
          q
            .eq('rootSeriesId', args.rootSeriesId)
            .eq('recurrenceIdUtc', args.recurrenceIdUtc!),
        )
        .collect()

      for (const exception of exceptions) {
        if (exception.participantUserId === null) {
          continue
        }

        if (exception.kind === 'remove') {
          participantMap.delete(exception.participantUserId)
          continue
        }

        participantMap.set(exception.participantUserId, {
          participantUserId: exception.participantUserId,
          role: exception.role ?? 'required',
          participantStatus: 'active',
          defaultRsvp: 'needsAction',
        })
      }
    }

    const participants = await Promise.all(
      Array.from(participantMap.values()).map(async (participant) => {
        const user = await ctx.db.get(participant.participantUserId)
        if (user === null) {
          return null
        }

        return {
          userId: user._id,
          name: user.name,
          email: user.email,
          role: participant.role,
          defaultRsvp: participant.defaultRsvp,
          isViewer: user._id === userId,
          isOrganizer: user._id === rootSession.organizerId,
        }
      }),
    )

    return participants
      .filter((participant): participant is NonNullable<typeof participant> => participant !== null)
      .sort((a, b) => {
        if (a.isOrganizer !== b.isOrganizer) {
          return a.isOrganizer ? -1 : 1
        }

        return a.name.localeCompare(b.name)
      })
  },
})

export const listStudioMemberOptions = query({
  args: {
    studioId: v.id('studios'),
  },
  handler: async (ctx, args) => {
    const { studio } = await assertStudioMember(ctx, args.studioId)

    const membershipDocs = await ctx.db
      .query('studioMembers')
      .withIndex('by_studio_id', (q) => q.eq('studioId', args.studioId))
      .collect()

    const memberIds = new Set<Id<'users'>>(
      membershipDocs.map((membership) => membership.userId),
    )
    memberIds.add(studio.createdBy)

    const members = await Promise.all(
      Array.from(memberIds).map(async (memberId) => {
        const user = await ctx.db.get(memberId)
        if (user === null) {
          return null
        }

        return {
          userId: user._id,
          name: user.name,
          email: user.email,
        }
      }),
    )

    return members
      .filter((member): member is NonNullable<typeof member> => member !== null)
      .sort((a, b) => a.name.localeCompare(b.name))
  },
})

async function applySeriesAllEventsPatch(
  ctx: MutationCtx,
  args: {
    series: Doc<'sessions'>
    actorId: Id<'users'>
    patch: SessionPatch
  },
) {
  const series = args.series
  const patch = args.patch

  const updated = applySingleLikePatch(series, patch)
  const currentAnchor = series.seriesAnchorLocal ?? getLocalDateTime(series.startAtUtc, series.timezone)
  const nextTimezone = patch.timezone ?? series.timezone

  const nextAnchorLocal = {
    ...currentAnchor,
    hour: patch.startLocalHour ?? currentAnchor.hour,
    minute: patch.startLocalMinute ?? currentAnchor.minute,
  }

  const updatedStartAtUtc =
    patch.startAtUtc ??
    (patch.startLocalHour !== null || patch.startLocalMinute !== null || patch.timezone !== null
      ? localDateTimeToUtc(nextAnchorLocal, nextTimezone)
      : series.startAtUtc)

  const now = Date.now()
  await ctx.db.patch(series._id, {
    ...updated,
    timezone: nextTimezone,
    startAtUtc: updatedStartAtUtc,
    endAtUtc: updatedStartAtUtc + updated.durationMinutes * 60_000,
    seriesAnchorLocal: nextAnchorLocal,
    version: series.version + 1,
    updatedBy: args.actorId,
    updatedAt: now,
  })

  await regenerateStudioProjection(ctx, series.studioId)

  return {
    seriesId: series._id,
    version: series.version + 1,
  }
}

async function performDeleteSeriesAllEvents(
  ctx: MutationCtx,
  args: {
    series: Doc<'sessions'>
    actorId: Id<'users'>
  },
) {
  const now = Date.now()
  await ctx.db.patch(args.series._id, {
    status: 'deleted',
    version: args.series.version + 1,
    updatedBy: args.actorId,
    updatedAt: now,
  })

  const rootSeriesId = args.series.rootSeriesId
  if (rootSeriesId !== null) {
    const relatedSessions = await ctx.db
      .query('sessions')
      .withIndex('by_root_series_id', (q) => q.eq('rootSeriesId', rootSeriesId))
      .collect()

    for (const relatedSession of relatedSessions) {
      if (relatedSession.type !== 'detached' || relatedSession.status === 'deleted') {
        continue
      }

      await ctx.db.patch(relatedSession._id, {
        status: 'deleted',
        version: relatedSession.version + 1,
        updatedBy: args.actorId,
        updatedAt: now,
      })
    }
  }

  await regenerateStudioProjection(ctx, args.series.studioId)

  return {
    seriesId: args.series._id,
    version: args.series.version + 1,
  }
}

function applySingleLikePatch(
  session: Doc<'sessions'>,
  patch: SessionPatch,
): {
  title: string
  notes: string | null
  location: string | null
  capacity: number | null
  timezone: string
  startAtUtc: number
  endAtUtc: number
  durationMinutes: number
} {
  const timezone = patch.timezone ?? session.timezone
  const startLocal = getLocalDateTime(session.startAtUtc, session.timezone)
  const nextStartAtUtc =
    patch.startAtUtc ??
    (patch.startLocalHour !== null || patch.startLocalMinute !== null || patch.timezone !== null
      ? localDateTimeToUtc(
          {
            ...startLocal,
            hour: patch.startLocalHour ?? startLocal.hour,
            minute: patch.startLocalMinute ?? startLocal.minute,
          },
          timezone,
        )
      : session.startAtUtc)

  const durationMinutes = patch.durationMinutes ?? session.durationMinutes

  return {
    title: patch.title ?? session.title,
    notes: patch.notes ?? session.notes,
    location: patch.location ?? session.location,
    capacity: patch.capacity ?? session.capacity,
    timezone,
    startAtUtc: nextStartAtUtc,
    endAtUtc: nextStartAtUtc + durationMinutes * 60_000,
    durationMinutes,
  }
}

function deriveDetachedPayloadFromOccurrence(args: {
  series: Doc<'sessions'>
  occurrenceStartUtc: number
  occurrenceLocal: LocalDateTime
  patch: SessionPatch
}) {
  const timezone = args.patch.timezone ?? args.series.timezone
  const startAtUtc =
    args.patch.startAtUtc ??
    (args.patch.startLocalHour !== null ||
    args.patch.startLocalMinute !== null ||
    args.patch.timezone !== null
      ? localDateTimeToUtc(
          {
            ...args.occurrenceLocal,
            hour: args.patch.startLocalHour ?? args.occurrenceLocal.hour,
            minute: args.patch.startLocalMinute ?? args.occurrenceLocal.minute,
          },
          timezone,
        )
      : args.occurrenceStartUtc)

  const durationMinutes = args.patch.durationMinutes ?? args.series.durationMinutes

  return {
    title: args.patch.title ?? args.series.title,
    notes: args.patch.notes ?? args.series.notes,
    location: args.patch.location ?? args.series.location,
    capacity: args.patch.capacity ?? args.series.capacity,
    timezone,
    startAtUtc,
    endAtUtc: startAtUtc + durationMinutes * 60_000,
    durationMinutes,
  }
}

function normalizePatch(patch: SessionPatch): SessionPatch {
  return {
    title: patch.title === null ? null : patch.title.trim(),
    notes: normalizeText(patch.notes),
    location: normalizeText(patch.location),
    capacity: normalizeCapacity(patch.capacity),
    durationMinutes: patch.durationMinutes === null ? null : normalizeDuration(patch.durationMinutes),
    timezone: patch.timezone === null ? null : patch.timezone,
    startAtUtc: patch.startAtUtc,
    startLocalHour:
      patch.startLocalHour === null ? null : clampNumber(Math.floor(patch.startLocalHour), 0, 23),
    startLocalMinute:
      patch.startLocalMinute === null ? null : clampNumber(Math.floor(patch.startLocalMinute), 0, 59),
  }
}

function normalizeText(value: string | null) {
  if (value === null) {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function normalizeCapacity(value: number | null) {
  if (value === null) {
    return null
  }

  return Math.max(1, Math.floor(value))
}

function normalizeDuration(value: number) {
  return Math.max(1, Math.floor(value))
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function assertVersion(actual: number, expected: number | null) {
  if (expected === null) {
    return
  }

  if (actual !== expected) {
    throw new Error(`Version mismatch. expected=${expected} actual=${actual}`)
  }
}

function requireSeriesRule(series: Doc<'sessions'>): SeriesRule {
  if (series.seriesRule === null) {
    throw new Error('Series rule not found.')
  }

  return series.seriesRule as SeriesRule
}

function findSeriesLastOccurrenceUtc(series: Doc<'sessions'>): number | null {
  if (series.seriesRule === null || series.seriesAnchorLocal === null) {
    return null
  }

  const rule = series.seriesRule as SeriesRule
  if (rule.count === null) {
    return rule.untilUtc
  }

  const yearsAhead = 20
  const windowEndUtc = new Date(series.startAtUtc)
  windowEndUtc.setUTCFullYear(windowEndUtc.getUTCFullYear() + yearsAhead)

  const occurrences = expandSeriesIntoWindow({
    series,
    windowStartUtc: series.startAtUtc,
    windowEndUtc: windowEndUtc.getTime(),
  })

  if (occurrences.length === 0) {
    return null
  }

  const target = occurrences[rule.count - 1]
  return target?.recurrenceIdUtc ?? occurrences[occurrences.length - 1]!.recurrenceIdUtc
}

function assertOccurrenceExists(series: Doc<'sessions'>, recurrenceIdUtc: number) {
  const searchWindow = 36 * 60 * 60 * 1000
  const expanded = expandSeriesIntoWindow({
    series,
    windowStartUtc: recurrenceIdUtc - searchWindow,
    windowEndUtc: recurrenceIdUtc + searchWindow,
  })

  const exists = expanded.some(
    (occurrence) => occurrence.recurrenceIdUtc === recurrenceIdUtc,
  )
  if (!exists) {
    throw new Error('Occurrence not found in this series.')
  }
}

async function regenerateStudioProjection(
  ctx: MutationCtx,
  studioId: Id<'studios'>,
) {
  const now = Date.now()
  const window = projectionWindowFor(now)
  await regenerateWindowForStudio(ctx, {
    studioId,
    windowStartUtc: window.startUtc,
    windowEndUtc: window.endUtc,
    generationVersion: now,
  })
}

async function getActiveSeries(
  ctx: MutationCtx | QueryCtx,
  seriesId: Id<'sessions'>,
) {
  const series = await ctx.db.get(seriesId)
  if (series === null || series.type !== 'series' || series.status !== 'active') {
    throw new Error('Series not found.')
  }

  return series
}

async function upsertParticipantsForAllEvents(
  ctx: MutationCtx,
  args: {
    studioId: Id<'studios'>
    rootSeriesId: Id<'sessions'>
    organizerId: Id<'users'>
    actorId: Id<'users'>
    participantUserIds: Array<Id<'users'>>
  },
) {
  const studioMembers = await ctx.db
    .query('studioMembers')
    .withIndex('by_studio_id', (q) => q.eq('studioId', args.studioId))
    .collect()

  const allowedMemberIds = new Set<Id<'users'>>(studioMembers.map((member) => member.userId))
  const studio = await ctx.db.get(args.studioId)
  if (studio !== null) {
    allowedMemberIds.add(studio.createdBy)
  }

  const uniqueParticipantIds = new Set<Id<'users'>>([
    args.organizerId,
    ...args.participantUserIds,
  ])

  for (const participantUserId of uniqueParticipantIds) {
    if (!allowedMemberIds.has(participantUserId)) {
      throw new Error('Participants must be studio members.')
    }

    const existing = await ctx.db
      .query('sessionParticipants')
      .withIndex('by_root_series_id_and_participant_user_id', (q) =>
        q.eq('rootSeriesId', args.rootSeriesId).eq('participantUserId', participantUserId),
      )
      .unique()

    const now = Date.now()
    const role = participantUserId === args.organizerId ? 'organizer' : 'required'
    const defaultRsvp = participantUserId === args.organizerId ? 'yes' : 'needsAction'

    if (existing === null) {
      await ctx.db.insert('sessionParticipants', {
        rootSeriesId: args.rootSeriesId,
        participantUserId,
        participantEmail: null,
        role,
        participantStatus: 'active',
        defaultRsvp,
        createdBy: args.actorId,
        updatedBy: args.actorId,
        createdAt: now,
        updatedAt: now,
      })
    } else {
      await ctx.db.patch(existing._id, {
        role,
        participantStatus: 'active',
        defaultRsvp,
        updatedBy: args.actorId,
        updatedAt: now,
      })
    }
  }
}

export function toOccurrenceLocalDateKey(utc: number, timezone: string) {
  return toLocalDateKey(getLocalDateTime(utc, timezone))
}
