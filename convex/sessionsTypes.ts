import type { Id } from './_generated/dataModel'
import { v } from 'convex/values'

export const weekdayValidator = v.union(
  v.literal('SU'),
  v.literal('MO'),
  v.literal('TU'),
  v.literal('WE'),
  v.literal('TH'),
  v.literal('FR'),
  v.literal('SA'),
)

export const seriesFrequencyValidator = v.union(v.literal('DAILY'), v.literal('WEEKLY'))

export const sessionScopeValidator = v.union(
  v.literal('THIS_EVENT'),
  v.literal('THIS_AND_FOLLOWING'),
  v.literal('ALL_EVENTS'),
)

export const participantRoleValidator = v.union(
  v.literal('organizer'),
  v.literal('required'),
  v.literal('optional'),
)

export const participantStatusValidator = v.union(v.literal('active'), v.literal('removed'))

export const rsvpValidator = v.union(
  v.literal('needsAction'),
  v.literal('yes'),
  v.literal('no'),
  v.literal('maybe'),
)

export const localDateTimeValidator = v.object({
  year: v.number(),
  month: v.number(),
  day: v.number(),
  hour: v.number(),
  minute: v.number(),
})

export const seriesRuleValidator = v.object({
  freq: seriesFrequencyValidator,
  interval: v.number(),
  byWeekday: v.array(weekdayValidator),
  count: v.union(v.number(), v.null()),
  untilUtc: v.union(v.number(), v.null()),
})

export const sessionPatchValidator = v.object({
  title: v.union(v.string(), v.null()),
  notes: v.union(v.string(), v.null()),
  location: v.union(v.string(), v.null()),
  capacity: v.union(v.number(), v.null()),
  durationMinutes: v.union(v.number(), v.null()),
  timezone: v.union(v.string(), v.null()),
  startAtUtc: v.union(v.number(), v.null()),
  startLocalHour: v.union(v.number(), v.null()),
  startLocalMinute: v.union(v.number(), v.null()),
})

export type Weekday = 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA'

export type LocalDateTime = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

export type SeriesRule = {
  freq: 'DAILY' | 'WEEKLY'
  interval: number
  byWeekday: Array<Weekday>
  count: number | null
  untilUtc: number | null
}

export type SessionPatch = {
  title: string | null
  notes: string | null
  location: string | null
  capacity: number | null
  durationMinutes: number | null
  timezone: string | null
  startAtUtc: number | null
  startLocalHour: number | null
  startLocalMinute: number | null
}

export type InstanceId =
  | { kind: 'single'; sessionId: Id<'sessions'> }
  | { kind: 'detached'; sessionId: Id<'sessions'> }
  | {
      kind: 'recurring'
      seriesId: Id<'sessions'>
      recurrenceIdUtc: number
    }

export function normalizeWeekdays(
  byWeekday: Array<Weekday>,
  fallback: Weekday,
): Array<Weekday> {
  if (byWeekday.length === 0) {
    return [fallback]
  }

  const unique = new Set<Weekday>(byWeekday)
  return Array.from(unique)
}
