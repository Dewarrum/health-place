import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    createdAt: v.number(),
    lastLoggedIn: v.number(),
  }).index('by_email', ['email']),
  userAuth: defineTable({
    tokenIdentifier: v.string(),
    userId: v.id('users'),
  })
    .index('by_token_identifier', ['tokenIdentifier'])
    .index('by_user_id', ['userId']),
})
