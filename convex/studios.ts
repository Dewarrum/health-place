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

    return await ctx.db.insert('studios', {
      name,
      address,
      createdBy: userId,
    })
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
