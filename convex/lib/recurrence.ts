import type { LocalDateTime, SeriesRule, Weekday } from '../sessionsTypes'

const weekdayToNumber: Record<Weekday, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
}

const numberToWeekday: Record<number, Weekday> = {
  0: 'SU',
  1: 'MO',
  2: 'TU',
  3: 'WE',
  4: 'TH',
  5: 'FR',
  6: 'SA',
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

export type ExpandedOccurrence = {
  recurrenceIdUtc: number
  startAtUtc: number
  endAtUtc: number
  localStart: LocalDateTime
}

export function getLocalDateTime(utcMs: number, timezone: string): LocalDateTime {
  const formatter = getFormatter(timezone)
  const parts = formatter.formatToParts(new Date(utcMs))

  const get = (name: Intl.DateTimeFormatPartTypes) => {
    const part = parts.find((entry) => entry.type === name)
    if (part === undefined) {
      throw new Error(`Missing date part ${name}`)
    }
    return Number(part.value)
  }

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  }
}

export function localDateTimeToUtc(local: LocalDateTime, timezone: string): number {
  const naiveUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, 0, 0)

  const exactCandidates: Array<number> = []
  const minSearch = naiveUtc - 12 * 60 * 60 * 1000
  const maxSearch = naiveUtc + 12 * 60 * 60 * 1000

  for (let candidate = minSearch; candidate <= maxSearch; candidate += 60_000) {
    const candidateLocal = getLocalDateTime(candidate, timezone)
    if (compareLocalDateTime(candidateLocal, local) === 0) {
      exactCandidates.push(candidate)
    }
  }

  if (exactCandidates.length > 0) {
    return exactCandidates[0]!
  }

  for (let candidate = naiveUtc; candidate <= naiveUtc + 24 * 60 * 60 * 1000; candidate += 60_000) {
    const candidateLocal = getLocalDateTime(candidate, timezone)
    if (compareLocalDateTime(candidateLocal, local) >= 0) {
      return candidate
    }
  }

  return naiveUtc
}

export function addDaysLocal(local: LocalDateTime, days: number): LocalDateTime {
  const date = new Date(Date.UTC(local.year, local.month - 1, local.day + days, 0, 0, 0, 0))
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: local.hour,
    minute: local.minute,
  }
}

export function weekdayFromLocal(local: LocalDateTime): Weekday {
  const date = new Date(Date.UTC(local.year, local.month - 1, local.day, 0, 0, 0, 0))
  return numberToWeekday[date.getUTCDay()]!
}

export function compareLocalDateTime(a: LocalDateTime, b: LocalDateTime): number {
  if (a.year !== b.year) {
    return a.year - b.year
  }
  if (a.month !== b.month) {
    return a.month - b.month
  }
  if (a.day !== b.day) {
    return a.day - b.day
  }
  if (a.hour !== b.hour) {
    return a.hour - b.hour
  }
  return a.minute - b.minute
}

export function dayDiff(a: LocalDateTime, b: LocalDateTime): number {
  const left = Date.UTC(a.year, a.month - 1, a.day, 0, 0, 0, 0)
  const right = Date.UTC(b.year, b.month - 1, b.day, 0, 0, 0, 0)
  return Math.floor((right - left) / 86_400_000)
}

export function toLocalDateKey(local: LocalDateTime): string {
  return `${local.year.toString().padStart(4, '0')}-${local.month
    .toString()
    .padStart(2, '0')}-${local.day.toString().padStart(2, '0')}`
}

export function generateSeriesOccurrencesInWindow(args: {
  anchorStartAtUtc: number
  durationMinutes: number
  timezone: string
  rule: SeriesRule
  anchorLocal: LocalDateTime
  windowStartUtc: number
  windowEndUtc: number
}): Array<ExpandedOccurrence> {
  const interval = Math.max(1, Math.floor(args.rule.interval))
  const untilUtc = args.rule.untilUtc
  const countLimit = args.rule.count

  const effectiveWindowEnd = untilUtc === null ? args.windowEndUtc : Math.min(args.windowEndUtc, untilUtc)
  if (effectiveWindowEnd < args.windowStartUtc) {
    return []
  }

  const anchorLocalDate = {
    ...args.anchorLocal,
    hour: 0,
    minute: 0,
  }
  const endLocal = getLocalDateTime(effectiveWindowEnd, args.timezone)
  const endCursor = {
    ...endLocal,
    hour: args.anchorLocal.hour,
    minute: args.anchorLocal.minute,
  }

  const byWeekdaySet = new Set<Weekday>(
    args.rule.byWeekday.length > 0
      ? args.rule.byWeekday
      : [weekdayFromLocal(args.anchorLocal)],
  )

  const occurrences: Array<ExpandedOccurrence> = []
  let emitted = 0
  let iterations = 0
  let cursor = { ...args.anchorLocal }

  while (compareLocalDateTime(cursor, endCursor) <= 0) {
    iterations += 1
    if (iterations > 20_000) {
      break
    }

    const shouldEmit =
      args.rule.freq === 'DAILY'
        ? dayDiff(anchorLocalDate, cursor) % interval === 0
        : dayDiff(anchorLocalDate, cursor) >= 0 &&
          Math.floor(dayDiff(anchorLocalDate, cursor) / 7) % interval === 0 &&
          byWeekdaySet.has(weekdayFromLocal(cursor))

    if (shouldEmit) {
      const startAtUtc = localDateTimeToUtc(cursor, args.timezone)
      if (startAtUtc >= args.anchorStartAtUtc && (untilUtc === null || startAtUtc <= untilUtc)) {
        emitted += 1

        if (countLimit !== null && emitted > countLimit) {
          break
        }

        if (startAtUtc >= args.windowStartUtc && startAtUtc <= effectiveWindowEnd) {
          occurrences.push({
            recurrenceIdUtc: startAtUtc,
            startAtUtc,
            endAtUtc: startAtUtc + args.durationMinutes * 60_000,
            localStart: { ...cursor },
          })
        }
      }
    }

    cursor = addDaysLocal(cursor, 1)
  }

  return occurrences
}

export function withLocalTime(
  local: LocalDateTime,
  hour: number,
  minute: number,
): LocalDateTime {
  return {
    ...local,
    hour,
    minute,
  }
}

export function isSeriesOccurrenceForDate(args: {
  rule: SeriesRule
  anchorLocal: LocalDateTime
  candidateLocal: LocalDateTime
}): boolean {
  const interval = Math.max(1, Math.floor(args.rule.interval))
  const daysFromAnchor = dayDiff(args.anchorLocal, args.candidateLocal)
  if (daysFromAnchor < 0) {
    return false
  }

  if (args.rule.freq === 'DAILY') {
    return daysFromAnchor % interval === 0
  }

  const weekdays = new Set<Weekday>(
    args.rule.byWeekday.length > 0
      ? args.rule.byWeekday
      : [weekdayFromLocal(args.anchorLocal)],
  )

  return Math.floor(daysFromAnchor / 7) % interval === 0 && weekdays.has(weekdayFromLocal(args.candidateLocal))
}

export function weekdayNumber(weekday: Weekday) {
  return weekdayToNumber[weekday]
}

function getFormatter(timezone: string) {
  const cached = formatterCache.get(timezone)
  if (cached !== undefined) {
    return cached
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  formatterCache.set(timezone, formatter)
  return formatter
}
