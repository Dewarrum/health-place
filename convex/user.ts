import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

export const profile = query({
  args: {},
  handler: async (ctx) => {
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
        return linkedUser
      }
    }

    if (typeof identity.email !== 'string') {
      return null
    }

    const email = normalizeEmail(identity.email)
    return await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique()
  },
})

export const profileDraft = query({
  args: {},
  handler: async (ctx) => {
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

    let existingProfile = authLink === null ? null : await ctx.db.get(authLink.userId)
    if (existingProfile === null && typeof identity.email === 'string') {
      const identityEmail = normalizeEmail(identity.email)
      existingProfile = await ctx.db
        .query('users')
        .withIndex('by_email', (q) => q.eq('email', identityEmail))
        .unique()
    }

    return {
      hasProfile: existingProfile !== null,
      name:
        existingProfile?.name ??
        (typeof identity.name === 'string' ? identity.name : ''),
      email:
        existingProfile?.email ??
        (typeof identity.email === 'string' ? normalizeEmail(identity.email) : ''),
    }
  },
})

export const upsertProfile = mutation({
  args: {
    name: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      throw new Error('Not authenticated')
    }

    const name = args.name.trim()
    if (name.length === 0) {
      throw new Error('Name is required')
    }

    const email = normalizeEmail(args.email)
    if (email.length === 0) {
      throw new Error('Email is required')
    }

    const authLink = await ctx.db
      .query('userAuth')
      .withIndex('by_token_identifier', (q) =>
        q.eq('tokenIdentifier', identity.tokenIdentifier),
      )
      .unique()

    let existingUser = authLink === null ? null : await ctx.db.get(authLink.userId)
    if (existingUser === null && typeof identity.email === 'string') {
      const identityEmail = normalizeEmail(identity.email)
      const fallbackByIdentityEmail = await ctx.db
        .query('users')
        .withIndex('by_email', (q) => q.eq('email', identityEmail))
        .unique()
      if (fallbackByIdentityEmail !== null) {
        existingUser = fallbackByIdentityEmail
      }
    }

    const existingUserWithEmail = await ctx.db
      .query('users')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique()
    if (
      existingUserWithEmail !== null &&
      (existingUser === null || existingUserWithEmail._id !== existingUser._id)
    ) {
      throw new Error('This email is already in use')
    }

    const now = Date.now()
    let userId = existingUser?._id ?? null

    if (existingUser !== null) {
      await ctx.db.patch(existingUser._id, {
        name,
        email,
        lastLoggedIn: now,
      })
      userId = existingUser._id
    } else {
      userId = await ctx.db.insert('users', {
        name,
        email,
        createdAt: now,
        lastLoggedIn: now,
      })
    }

    if (userId === null) {
      throw new Error('Failed to save profile')
    }

    if (authLink === null) {
      await ctx.db.insert('userAuth', {
        tokenIdentifier: identity.tokenIdentifier,
        userId,
      })
    } else if (authLink.userId !== userId) {
      await ctx.db.patch(authLink._id, {
        userId,
      })
    }

    return await ctx.db.get(userId)
  },
})

export const touchLastLoggedIn = mutation({
  args: {},
  handler: async (ctx) => {
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

    let existingUser = authLink === null ? null : await ctx.db.get(authLink.userId)
    if (existingUser === null && typeof identity.email === 'string') {
      const identityEmail = normalizeEmail(identity.email)
      existingUser = await ctx.db
        .query('users')
        .withIndex('by_email', (q) => q.eq('email', identityEmail))
        .unique()
    }

    if (existingUser === null) {
      return null
    }

    if (authLink === null) {
      await ctx.db.insert('userAuth', {
        tokenIdentifier: identity.tokenIdentifier,
        userId: existingUser._id,
      })
    } else if (authLink.userId !== existingUser._id) {
      await ctx.db.patch(authLink._id, {
        userId: existingUser._id,
      })
    }

    await ctx.db.patch(existingUser._id, {
      lastLoggedIn: Date.now(),
    })

    return await ctx.db.get(existingUser._id)
  },
})

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}
