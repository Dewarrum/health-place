import type { Id } from './_generated/dataModel'
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { v } from 'convex/values'

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await resolveCurrentUserId(ctx)
    if (userId === null) {
      return []
    }

    return await ctx.db
      .query('studios')
      .withIndex('by_created_by', (q) => q.eq('createdBy', userId))
      .order('desc')
      .collect()
  },
})

export const dashboard = query({
  args: {
    studioId: v.id('studios'),
  },
  handler: async (ctx, args) => {
    const userId = await resolveCurrentUserId(ctx)
    if (userId === null) {
      throw new Error('Create your profile to access studio dashboards.')
    }

    const studio = await ctx.db.get(args.studioId)
    if (studio === null || studio.createdBy !== userId) {
      throw new Error('Studio not found.')
    }

    const membershipDocs = await ctx.db
      .query('studioMembers')
      .withIndex('by_studio_id', (q) => q.eq('studioId', args.studioId))
      .collect()

    const latestMembershipByUser = new Map<
      Id<'users'>,
      { userId: Id<'users'>; joinedAt: number }
    >()
    for (const membership of membershipDocs) {
      const previousMembership = latestMembershipByUser.get(membership.userId)
      if (previousMembership === undefined || membership.joinedAt > previousMembership.joinedAt) {
        latestMembershipByUser.set(membership.userId, {
          userId: membership.userId,
          joinedAt: membership.joinedAt,
        })
      }
    }

    if (!latestMembershipByUser.has(studio.createdBy)) {
      latestMembershipByUser.set(studio.createdBy, {
        userId: studio.createdBy,
        joinedAt: studio._creationTime,
      })
    }

    const memberEntries = await Promise.all(
      Array.from(latestMembershipByUser.values()).map(async (membership) => {
        const user = await ctx.db.get(membership.userId)
        if (user === null) {
          return null
        }

        return {
          userId: user._id,
          name: user.name,
          email: user.email,
          joinedAt: membership.joinedAt,
        }
      }),
    )

    const members = memberEntries
      .filter((member): member is NonNullable<typeof member> => member !== null)
      .sort((a, b) => b.joinedAt - a.joinedAt)

    return {
      studio: {
        _id: studio._id,
        name: studio.name,
        address: studio.address,
        createdAt: studio._creationTime,
      },
      memberCount: members.length,
      recentMembers: members.slice(0, 10),
    }
  },
})

export const create = mutation({
  args: {
    name: v.string(),
    address: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await resolveCurrentUserId(ctx)
    if (userId === null) {
      throw new Error('Create your profile before creating studios.')
    }

    const name = args.name.trim()
    if (name.length === 0) {
      throw new Error('Studio name is required.')
    }

    const address = args.address.trim()
    if (address.length === 0) {
      throw new Error('Studio address is required.')
    }

    const now = Date.now()
    const studioId = await ctx.db.insert('studios', {
      name,
      address,
      createdBy: userId,
    })

    await ctx.db.insert('studioMembers', {
      studioId,
      userId,
      joinedAt: now,
    })

    return studioId
  },
})

async function resolveCurrentUserId(
  ctx: QueryCtx | MutationCtx,
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

  if (typeof identity.email !== 'string') {
    return null
  }
  const identityEmail = identity.email

  const fallbackUser = await ctx.db
    .query('users')
    .withIndex('by_email', (q) => q.eq('email', normalizeEmail(identityEmail)))
    .unique()

  return fallbackUser?._id ?? null
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}
