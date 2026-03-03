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
  sessions: defineTable({
    studioId: v.id('studios'),
    organizerId: v.id('users'),
    type: v.union(v.literal('single'), v.literal('series'), v.literal('detached')),
    status: v.union(v.literal('active'), v.literal('deleted')),
    title: v.string(),
    notes: v.union(v.string(), v.null()),
    location: v.union(v.string(), v.null()),
    capacity: v.union(v.number(), v.null()),
    timezone: v.string(),
    startAtUtc: v.number(),
    endAtUtc: v.number(),
    durationMinutes: v.number(),
    seriesRule: v.union(
      v.object({
        freq: v.union(v.literal('DAILY'), v.literal('WEEKLY')),
        interval: v.number(),
        byWeekday: v.array(
          v.union(
            v.literal('SU'),
            v.literal('MO'),
            v.literal('TU'),
            v.literal('WE'),
            v.literal('TH'),
            v.literal('FR'),
            v.literal('SA'),
          ),
        ),
        count: v.union(v.number(), v.null()),
        untilUtc: v.union(v.number(), v.null()),
      }),
      v.null(),
    ),
    seriesAnchorLocal: v.union(
      v.object({
        year: v.number(),
        month: v.number(),
        day: v.number(),
        hour: v.number(),
        minute: v.number(),
      }),
      v.null(),
    ),
    rootSeriesId: v.union(v.id('sessions'), v.null()),
    splitFromSeriesId: v.union(v.id('sessions'), v.null()),
    version: v.number(),
    createdBy: v.id('users'),
    updatedBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_studio_id_and_type', ['studioId', 'type'])
    .index('by_studio_id_and_status', ['studioId', 'status'])
    .index('by_organizer_id_and_status', ['organizerId', 'status'])
    .index('by_root_series_id', ['rootSeriesId'])
    .index('by_studio_id_and_type_and_start_at_utc', ['studioId', 'type', 'startAtUtc']),
  sessionExceptions: defineTable({
    seriesId: v.id('sessions'),
    recurrenceIdUtc: v.number(),
    originalLocalStart: v.object({
      year: v.number(),
      month: v.number(),
      day: v.number(),
      hour: v.number(),
      minute: v.number(),
    }),
    kind: v.union(v.literal('cancel'), v.literal('override')),
    overridePayload: v.union(
      v.object({
        title: v.union(v.string(), v.null()),
        notes: v.union(v.string(), v.null()),
        location: v.union(v.string(), v.null()),
        capacity: v.union(v.number(), v.null()),
        startAtUtc: v.union(v.number(), v.null()),
        endAtUtc: v.union(v.number(), v.null()),
        durationMinutes: v.union(v.number(), v.null()),
      }),
      v.null(),
    ),
    detachedSessionId: v.union(v.id('sessions'), v.null()),
    version: v.number(),
    createdBy: v.id('users'),
    updatedBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_series_id_and_recurrence_id_utc', ['seriesId', 'recurrenceIdUtc'])
    .index('by_series_id', ['seriesId']),
  sessionOccurrences: defineTable({
    studioId: v.id('studios'),
    organizerId: v.id('users'),
    sourceType: v.union(
      v.literal('single'),
      v.literal('detached'),
      v.literal('recurring_generated'),
    ),
    sessionId: v.union(v.id('sessions'), v.null()),
    seriesId: v.union(v.id('sessions'), v.null()),
    rootSeriesId: v.union(v.id('sessions'), v.null()),
    recurrenceIdUtc: v.union(v.number(), v.null()),
    startAtUtc: v.number(),
    endAtUtc: v.number(),
    timezone: v.string(),
    title: v.string(),
    notes: v.union(v.string(), v.null()),
    location: v.union(v.string(), v.null()),
    capacity: v.union(v.number(), v.null()),
    isCancelled: v.boolean(),
    generationVersion: v.number(),
    generatedAt: v.number(),
  })
    .index('by_studio_id_and_start_at_utc', ['studioId', 'startAtUtc'])
    .index('by_organizer_id_and_start_at_utc', ['organizerId', 'startAtUtc'])
    .index('by_series_id_and_recurrence_id_utc', ['seriesId', 'recurrenceIdUtc'])
    .index('by_session_id', ['sessionId']),
  sessionParticipants: defineTable({
    rootSeriesId: v.id('sessions'),
    participantUserId: v.union(v.id('users'), v.null()),
    participantEmail: v.union(v.string(), v.null()),
    role: v.union(v.literal('organizer'), v.literal('required'), v.literal('optional')),
    participantStatus: v.union(v.literal('active'), v.literal('removed')),
    defaultRsvp: v.union(
      v.literal('needsAction'),
      v.literal('yes'),
      v.literal('no'),
      v.literal('maybe'),
    ),
    createdBy: v.id('users'),
    updatedBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_root_series_id', ['rootSeriesId'])
    .index('by_root_series_id_and_participant_user_id', ['rootSeriesId', 'participantUserId'])
    .index('by_participant_email', ['participantEmail']),
  sessionParticipantExceptions: defineTable({
    rootSeriesId: v.id('sessions'),
    recurrenceIdUtc: v.number(),
    participantUserId: v.union(v.id('users'), v.null()),
    participantEmail: v.union(v.string(), v.null()),
    kind: v.union(v.literal('add'), v.literal('remove')),
    role: v.union(v.literal('required'), v.literal('optional'), v.null()),
    createdBy: v.id('users'),
    updatedBy: v.id('users'),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_root_series_id_and_recurrence_id_utc', ['rootSeriesId', 'recurrenceIdUtc'])
    .index('by_root_series_id', ['rootSeriesId']),
  sessionRsvpOverrides: defineTable({
    rootSeriesId: v.id('sessions'),
    recurrenceIdUtc: v.number(),
    participantId: v.id('users'),
    response: v.union(
      v.literal('needsAction'),
      v.literal('yes'),
      v.literal('no'),
      v.literal('maybe'),
    ),
    respondedAt: v.number(),
    respondedBy: v.id('users'),
  })
    .index('by_root_series_id_and_recurrence_id_utc', ['rootSeriesId', 'recurrenceIdUtc'])
    .index('by_participant_id_and_recurrence_id_utc', ['participantId', 'recurrenceIdUtc']),
})
