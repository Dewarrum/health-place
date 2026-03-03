import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    createdAt: v.number(),
    lastLoggedIn: v.number(),
  }).index('by_email', ['email']),
  studios: defineTable({
    name: v.string(),
    address: v.string(),
    createdBy: v.id('users'),
  }).index('by_created_by', ['createdBy']),
  studioMembers: defineTable({
    studioId: v.id('studios'),
    userId: v.id('users'),
    joinedAt: v.number(),
  })
    .index('by_studio_id', ['studioId'])
    .index('by_user_id', ['userId'])
    .index('by_studio_id_and_user_id', ['studioId', 'userId']),
  studioInvitations: defineTable({
    studioId: v.id('studios'),
    invitedEmail: v.string(),
    invitedBy: v.id('users'),
    status: v.union(
      v.literal('pending'),
      v.literal('accepted'),
      v.literal('declined'),
    ),
    createdAt: v.number(),
    respondedAt: v.union(v.number(), v.null()),
    respondedBy: v.union(v.id('users'), v.null()),
  })
    .index('by_studio_id', ['studioId'])
    .index('by_studio_id_and_status', ['studioId', 'status'])
    .index('by_studio_id_and_invited_email', ['studioId', 'invitedEmail'])
    .index('by_invited_email', ['invitedEmail'])
    .index('by_invited_email_and_status', ['invitedEmail', 'status']),
  userAuth: defineTable({
    tokenIdentifier: v.string(),
    userId: v.id('users'),
  })
    .index('by_token_identifier', ['tokenIdentifier'])
    .index('by_user_id', ['userId']),
})
