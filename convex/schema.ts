import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  posts: defineTable({
    id: v.string(),
    title: v.string(),
    body: v.string(),
  }).index('id', ['id']),
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
