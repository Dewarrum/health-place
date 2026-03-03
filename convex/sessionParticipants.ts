import type { Id } from './_generated/dataModel'
import { mutation, type MutationCtx } from './_generated/server'
import { v } from 'convex/values'
import { assertCanManageSession } from './lib/authz'

export const addParticipantsAllEvents = mutation({
  args: {
    rootSeriesId: v.id('sessions'),
    participantUserIds: v.array(v.id('users')),
    role: v.union(v.literal('required'), v.literal('optional')),
  },
  handler: async (ctx, args) => {
    const rootSession = await ctx.db.get(args.rootSeriesId)
    if (rootSession === null || rootSession.status !== 'active') {
      throw new Error('Session not found.')
    }

    const { userId } = await assertCanManageSession(ctx, rootSession)
    const allowedMembers = await studioMemberSet(ctx, rootSession.studioId)

    const now = Date.now()
    for (const participantUserId of new Set(args.participantUserIds)) {
      if (!allowedMembers.has(participantUserId)) {
        throw new Error('Participants must be studio members.')
      }

      const existing = await ctx.db
        .query('sessionParticipants')
        .withIndex('by_root_series_id_and_participant_user_id', (q) =>
          q.eq('rootSeriesId', args.rootSeriesId).eq('participantUserId', participantUserId),
        )
        .unique()

      if (existing === null) {
        await ctx.db.insert('sessionParticipants', {
          rootSeriesId: args.rootSeriesId,
          participantUserId,
          participantEmail: null,
          role: participantUserId === rootSession.organizerId ? 'organizer' : args.role,
          participantStatus: 'active',
          defaultRsvp: participantUserId === rootSession.organizerId ? 'yes' : 'needsAction',
          createdBy: userId,
          updatedBy: userId,
          createdAt: now,
          updatedAt: now,
        })
      } else {
        await ctx.db.patch(existing._id, {
          role: participantUserId === rootSession.organizerId ? 'organizer' : args.role,
          participantStatus: 'active',
          updatedBy: userId,
          updatedAt: now,
        })
      }
    }

    return {
      rootSeriesId: args.rootSeriesId,
      addedCount: new Set(args.participantUserIds).size,
    }
  },
})

export const removeParticipantAllEvents = mutation({
  args: {
    rootSeriesId: v.id('sessions'),
    participantUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const rootSession = await ctx.db.get(args.rootSeriesId)
    if (rootSession === null || rootSession.status !== 'active') {
      throw new Error('Session not found.')
    }

    const { userId } = await assertCanManageSession(ctx, rootSession)
    if (args.participantUserId === rootSession.organizerId) {
      throw new Error('Organizer cannot be removed from all events.')
    }

    const existing = await ctx.db
      .query('sessionParticipants')
      .withIndex('by_root_series_id_and_participant_user_id', (q) =>
        q.eq('rootSeriesId', args.rootSeriesId).eq('participantUserId', args.participantUserId),
      )
      .unique()

    if (existing === null) {
      return {
        rootSeriesId: args.rootSeriesId,
        removed: false,
      }
    }

    await ctx.db.patch(existing._id, {
      participantStatus: 'removed',
      updatedBy: userId,
      updatedAt: Date.now(),
    })

    return {
      rootSeriesId: args.rootSeriesId,
      removed: true,
    }
  },
})

export const addParticipantThisEvent = mutation({
  args: {
    rootSeriesId: v.id('sessions'),
    recurrenceIdUtc: v.number(),
    participantUserId: v.id('users'),
    role: v.union(v.literal('required'), v.literal('optional')),
  },
  handler: async (ctx, args) => {
    const rootSession = await ctx.db.get(args.rootSeriesId)
    if (rootSession === null || rootSession.status !== 'active') {
      throw new Error('Session not found.')
    }

    const { userId } = await assertCanManageSession(ctx, rootSession)
    const allowedMembers = await studioMemberSet(ctx, rootSession.studioId)

    if (!allowedMembers.has(args.participantUserId)) {
      throw new Error('Participants must be studio members.')
    }

    const existing = await findParticipantException(
      ctx,
      args.rootSeriesId,
      args.recurrenceIdUtc,
      args.participantUserId,
    )

    const now = Date.now()
    if (existing === null) {
      await ctx.db.insert('sessionParticipantExceptions', {
        rootSeriesId: args.rootSeriesId,
        recurrenceIdUtc: args.recurrenceIdUtc,
        participantUserId: args.participantUserId,
        participantEmail: null,
        kind: 'add',
        role: args.role,
        createdBy: userId,
        updatedBy: userId,
        createdAt: now,
        updatedAt: now,
      })
    } else {
      await ctx.db.patch(existing._id, {
        kind: 'add',
        role: args.role,
        updatedBy: userId,
        updatedAt: now,
      })
    }

    return {
      rootSeriesId: args.rootSeriesId,
      recurrenceIdUtc: args.recurrenceIdUtc,
      participantUserId: args.participantUserId,
    }
  },
})

export const removeParticipantThisEvent = mutation({
  args: {
    rootSeriesId: v.id('sessions'),
    recurrenceIdUtc: v.number(),
    participantUserId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const rootSession = await ctx.db.get(args.rootSeriesId)
    if (rootSession === null || rootSession.status !== 'active') {
      throw new Error('Session not found.')
    }

    const { userId } = await assertCanManageSession(ctx, rootSession)
    if (args.participantUserId === rootSession.organizerId) {
      throw new Error('Organizer cannot be removed from an occurrence.')
    }

    const existing = await findParticipantException(
      ctx,
      args.rootSeriesId,
      args.recurrenceIdUtc,
      args.participantUserId,
    )

    const now = Date.now()
    if (existing === null) {
      await ctx.db.insert('sessionParticipantExceptions', {
        rootSeriesId: args.rootSeriesId,
        recurrenceIdUtc: args.recurrenceIdUtc,
        participantUserId: args.participantUserId,
        participantEmail: null,
        kind: 'remove',
        role: null,
        createdBy: userId,
        updatedBy: userId,
        createdAt: now,
        updatedAt: now,
      })
    } else {
      await ctx.db.patch(existing._id, {
        kind: 'remove',
        role: null,
        updatedBy: userId,
        updatedAt: now,
      })
    }

    return {
      rootSeriesId: args.rootSeriesId,
      recurrenceIdUtc: args.recurrenceIdUtc,
      participantUserId: args.participantUserId,
    }
  },
})

async function studioMemberSet(
  ctx: MutationCtx,
  studioId: Id<'studios'>,
) {
  const members = await ctx.db
    .query('studioMembers')
    .withIndex('by_studio_id', (q) => q.eq('studioId', studioId))
    .collect()

  const allowed = new Set<Id<'users'>>(members.map((member) => member.userId))
  const studio = await ctx.db.get(studioId)
  if (studio !== null) {
    allowed.add(studio.createdBy)
  }

  return allowed
}

async function findParticipantException(
  ctx: MutationCtx,
  rootSeriesId: Id<'sessions'>,
  recurrenceIdUtc: number,
  participantUserId: Id<'users'>,
) {
  const exceptions = await ctx.db
    .query('sessionParticipantExceptions')
    .withIndex('by_root_series_id_and_recurrence_id_utc', (q) =>
      q.eq('rootSeriesId', rootSeriesId).eq('recurrenceIdUtc', recurrenceIdUtc),
    )
    .collect()

  return (
    exceptions.find((row) => row.participantUserId === participantUserId) ?? null
  )
}
