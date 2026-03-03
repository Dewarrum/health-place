import type { Doc, Id } from '../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../_generated/server'

export type ConvexAuthCtx = QueryCtx | MutationCtx

export async function resolveCurrentUserId(
  ctx: ConvexAuthCtx,
): Promise<Id<'users'> | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) {
    return null
  }

  const authLink = await ctx.db
    .query('userAuth')
    .withIndex('by_token_identifier', (q) =>
      q.eq('tokenIdentifier', identity.tokenIdentifier),
    )
    .unique()

  if (authLink !== null) {
    const linkedUser = await ctx.db.get(authLink.userId)
    if (linkedUser !== null) {
      return linkedUser._id
    }
  }

  const identityEmail = identity.email
  if (typeof identityEmail !== 'string') {
    return null
  }

  const fallbackUser = await ctx.db
    .query('users')
    .withIndex('by_email', (q) => q.eq('email', normalizeEmail(identityEmail)))
    .unique()

  return fallbackUser?._id ?? null
}

export async function assertStudioMember(
  ctx: ConvexAuthCtx,
  studioId: Id<'studios'>,
): Promise<{ userId: Id<'users'>; studio: Doc<'studios'>; isOwner: boolean }> {
  const userId = await resolveCurrentUserId(ctx)
  if (userId === null) {
    throw new Error('Not authenticated.')
  }

  const studio = await ctx.db.get(studioId)
  if (studio === null) {
    throw new Error('Studio not found.')
  }

  if (studio.createdBy === userId) {
    return {
      userId,
      studio,
      isOwner: true,
    }
  }

  const membership = await ctx.db
    .query('studioMembers')
    .withIndex('by_studio_id_and_user_id', (q) =>
      q.eq('studioId', studioId).eq('userId', userId),
    )
    .unique()

  if (membership === null) {
    throw new Error('You are not a member of this studio.')
  }

  return {
    userId,
    studio,
    isOwner: false,
  }
}

export async function assertCanManageSession(
  ctx: ConvexAuthCtx,
  session: Doc<'sessions'>,
): Promise<{ userId: Id<'users'>; isOwner: boolean }> {
  const { userId, studio, isOwner } = await assertStudioMember(ctx, session.studioId)

  if (session.organizerId !== userId && studio.createdBy !== userId) {
    throw new Error('Only organizer or studio owner can manage this session.')
  }

  return {
    userId,
    isOwner,
  }
}

export async function assertCanViewParticipants(
  ctx: ConvexAuthCtx,
  args: {
    rootSeriesId: Id<'sessions'>
    recurrenceIdUtc: number | null
  },
): Promise<{ userId: Id<'users'> }> {
  const userId = await resolveCurrentUserId(ctx)
  if (userId === null) {
    throw new Error('Not authenticated.')
  }

  const session = await ctx.db.get(args.rootSeriesId)
  if (session === null) {
    throw new Error('Session not found.')
  }

  const { studio } = await assertStudioMember(ctx, session.studioId)
  if (studio.createdBy === userId || session.organizerId === userId) {
    return { userId }
  }

  const participant = await ctx.db
    .query('sessionParticipants')
    .withIndex('by_root_series_id_and_participant_user_id', (q) =>
      q.eq('rootSeriesId', args.rootSeriesId).eq('participantUserId', userId),
    )
    .unique()

  if (participant !== null && participant.participantStatus === 'active') {
    return { userId }
  }

  const recurrenceIdUtc = args.recurrenceIdUtc
  if (recurrenceIdUtc !== null) {
    const participantExceptions = await ctx.db
      .query('sessionParticipantExceptions')
      .withIndex('by_root_series_id_and_recurrence_id_utc', (q) =>
        q
          .eq('rootSeriesId', args.rootSeriesId)
          .eq('recurrenceIdUtc', recurrenceIdUtc),
      )
      .collect()

    let addedForOccurrence = false
    for (const participantException of participantExceptions) {
      if (participantException.participantUserId !== userId) {
        continue
      }

      if (participantException.kind === 'add') {
        addedForOccurrence = true
      }
      if (participantException.kind === 'remove') {
        addedForOccurrence = false
      }
    }

    if (addedForOccurrence) {
      return { userId }
    }
  }

  throw new Error('You do not have permission to view participants for this session.')
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}
