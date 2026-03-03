# Session Events Architecture (Single + Recurring)

## 1. Objective
Design a session system with Google Calendar-like behavior:
- Single (non-recurring) sessions.
- Recurring sessions.
- Multi-member participation (not single-member only).
- Per-instance edit/delete for recurring sessions.
- RSVP-ready architecture for future Google Calendar-style responses.
- Scope controls on recurring edits/deletes:
  - `THIS_EVENT`
  - `THIS_AND_FOLLOWING`
  - `ALL_EVENTS`

This document defines product semantics, data architecture, API contracts, and operational constraints. It intentionally contains no implementation code.

## 2. Scope and Non-Goals
In scope:
- Session creation, edit, and deletion semantics.
- Data modeling for recurring rules and per-instance overrides.
- Querying calendar windows efficiently.
- Concurrency, auditability, and migration strategy.

Out of scope (for first implementation):
- Attendee invitations/RSVP workflows.
- External calendar sync (Google/Apple).
- Advanced enterprise scheduling constraints.

## 3. Core Product Semantics
### 3.1 Session Types
- `SINGLE`: one standalone session.
- `SERIES`: recurring template that generates occurrences.
- `DETACHED`: standalone session created from editing one occurrence in a series (override materialization).

### 3.2 Recurring Edit/Delete Scopes
When user acts from a recurring occurrence:
- `THIS_EVENT`
  - Edit: affects only selected occurrence.
  - Delete: cancels only selected occurrence.
- `THIS_AND_FOLLOWING`
  - Edit: selected occurrence and all future occurrences are changed.
  - Delete: selected occurrence and all future occurrences are removed.
- `ALL_EVENTS`
  - Edit/Delete: entire series (past and future), with existing detached exceptions preserved unless explicitly removed.

## 4. Architecture Overview
Use a canonical-source + projection architecture.

Canonical (source of truth):
1. `sessions`
2. `sessionExceptions`

Derived (query-optimized projection):
3. `sessionOccurrences` (materialized horizon fixed at next 12 months + recent 3 months)

Why this architecture:
- Canonical layer keeps recurrence logic correct and auditable.
- Projection layer makes month/week/day calendar queries fast in Convex.
- Supports infinite/open-ended recurrence without pre-creating infinite rows.

## 5. Data Model
## 5.1 `sessions` table (canonical)
Represents `SINGLE`, `SERIES`, and `DETACHED` rows.

Suggested fields:
- `studioId`
- `organizerId` (host/owner of the session)
- `type`: `single | series | detached`
- `status`: `active | deleted`
- `title`, `notes`, `location`, `capacity` (session payload)
- `timezone` (IANA, e.g. `America/Los_Angeles`)
- `startAtUtc`, `endAtUtc` (for single/detached, and first anchor for series)
- `durationMinutes`
- `seriesRule` (nullable for non-series):
  - `freq` (`DAILY | WEEKLY | MONTHLY | YEARLY`)
  - `interval`
  - `byWeekday[]`
  - `byMonthday[]`
  - `count` or `untilUtc` (never both)
- `seriesAnchorLocal` (local wall-clock anchor for DST-safe recurrence expansion)
- `rootSeriesId` (self for initial series, reused across splits)
- `splitFromSeriesId` (nullable lineage pointer)
- `version` (optimistic concurrency)
- `createdBy`, `updatedBy`, `createdAt`, `updatedAt`

Convex indexes (initial):
- `by_studio_id_and_type`
- `by_studio_id_and_status`
- `by_organizer_id_and_status`
- `by_root_series_id`

## 5.2 `sessionExceptions` table (canonical)
Represents per-occurrence changes for a `SERIES`.

Suggested fields:
- `seriesId`
- `recurrenceIdUtc` (stable occurrence identity; equivalent to RECURRENCE-ID)
- `originalLocalStart` (for robust split remapping)
- `kind`: `cancel | override`
- `overridePayload` (nullable when `cancel`)
- `detachedSessionId` (nullable; set when override is represented as detached row)
- `version`
- `createdBy`, `updatedBy`, `createdAt`, `updatedAt`

Convex indexes:
- `by_series_id_and_recurrence_id_utc`
- `by_series_id`

## 5.3 `sessionOccurrences` table (derived projection)
Concrete rows for calendar window queries.

Suggested fields:
- `studioId`
- `organizerId`
- `sourceType`: `single | detached | recurring_generated`
- `sessionId` (for single/detached)
- `seriesId` + `recurrenceIdUtc` (for recurring_generated)
- `startAtUtc`, `endAtUtc`, `timezone`
- `title`, `notes`, `location`, `capacity` (resolved payload)
- `isCancelled`
- `generationVersion`
- `generatedAt`

Convex indexes:
- `by_studio_id_and_start_at_utc`
- `by_organizer_id_and_start_at_utc`
- `by_series_id_and_recurrence_id_utc`
- `by_session_id`

## 5.4 `sessionParticipants` table (canonical)
Represents invited participants for single or recurring sessions.

Design choice:
- Attach participants to `rootSeriesId` (not split segment id) so `THIS_AND_FOLLOWING` series splits do not duplicate participant lists.
- For single sessions, `rootSeriesId` is the same as the single session id.

Suggested fields:
- `rootSeriesId`
- `participantUserId` (nullable for external invitees)
- `participantEmail` (required when `participantUserId` is null)
- `role`: `organizer | required | optional`
- `participantStatus`: `active | removed`
- `defaultRsvp`: `needsAction | yes | no | maybe`
- `createdBy`, `updatedBy`, `createdAt`, `updatedAt`

Convex indexes:
- `by_root_series_id`
- `by_root_series_id_and_participant_user_id`
- `by_participant_email`

## 5.5 `sessionParticipantExceptions` table (canonical)
Per-occurrence participant list changes (add/remove attendee only for one occurrence).

Suggested fields:
- `rootSeriesId`
- `recurrenceIdUtc`
- `participantRef` (participant id or email key)
- `kind`: `add | remove`
- `payload` (participant role/details when `add`)
- `createdBy`, `updatedBy`, `createdAt`, `updatedAt`

Convex indexes:
- `by_root_series_id_and_recurrence_id_utc`
- `by_root_series_id`

## 5.6 `sessionRsvpOverrides` table (canonical)
Per-occurrence RSVP overrides that differ from participant default.

Suggested fields:
- `rootSeriesId`
- `recurrenceIdUtc`
- `participantId`
- `response`: `yes | no | maybe | needsAction`
- `respondedAt`, `respondedBy`

Convex indexes:
- `by_root_series_id_and_recurrence_id_utc`
- `by_participant_id_and_recurrence_id_utc`

## 6. Stable Identity Rules
Occurrence identity must remain deterministic:
- Recurring occurrence key = `(seriesId, recurrenceIdUtc)`.
- Detached occurrence key = detached `sessionId`.
- API/UI instance id can be encoded as:
  - `rec:<seriesId>:<recurrenceIdUtc>`
  - `single:<sessionId>`
  - `det:<sessionId>`

## 7. Mutation Semantics
## 7.1 Create
- Single: create one `sessions` row (`type=single`) and one projection occurrence.
- Recurring: create one `sessions` row (`type=series`) and generate projection occurrences for horizon.

## 7.2 Edit
### Edit single
- Patch the `sessions` row.
- Regenerate/patch linked projection rows.

### Edit recurring with `THIS_EVENT`
- Upsert `sessionExceptions` at `(seriesId, recurrenceIdUtc)` with `kind=override`.
- Store changed fields in `overridePayload` or create/update detached session row.
- Regenerate only affected occurrence projection.

### Edit recurring with `THIS_AND_FOLLOWING`
Perform series split:
1. Truncate old series so last occurrence is immediately before target occurrence.
2. Create new `sessions` series row starting at target occurrence with edited rule/payload.
3. Preserve lineage with `rootSeriesId`, `splitFromSeriesId`.
4. Re-map future exceptions:
   - Primary: map by `originalLocalStart` into new series.
   - Fallback (chosen): convert non-mappable overrides into detached sessions so user edits are not lost.
5. Regenerate projection rows only for impacted ranges.

Participant/RSVP behavior during split:
- Keep participants on `rootSeriesId` so no participant duplication is needed.
- Keep RSVP defaults on participant rows.
- Occurrence RSVP overrides remain keyed by `rootSeriesId + recurrenceIdUtc`.

### Edit recurring with `ALL_EVENTS`
- Patch series payload/rule globally.
- Historical views should reflect updated title/details for past generated occurrences.
- Keep historical detached overrides unless explicitly removed by user action.
- Rebuild projection rows for affected horizon.

## 7.3 Delete
### Delete single
- Soft delete `sessions` row (`status=deleted`) and remove/hide occurrence projection.

### Delete recurring `THIS_EVENT`
- Upsert exception with `kind=cancel` for specific recurrenceId.

### Delete recurring `THIS_AND_FOLLOWING`
- Truncate series at previous occurrence.
- Remove/hide projection rows from target onward.

### Delete recurring `ALL_EVENTS`
- Soft delete full series.
- Remove/hide all associated projection rows.

## 8. Query Model
Primary read path for calendar screens:
1. Query `sessionOccurrences` by `studioId` + time window.
2. Return concrete instances already resolved for:
   - Recurrence generation
   - Overrides
   - Cancellations

Fallback/recovery path:
- If projection is stale/missing, regenerate impacted window from canonical rows, then return.

## 9. Timezone and DST Rules
- Every series stores an IANA timezone and local anchor.
- Recurrence expansion is based on local wall-clock semantics (not fixed UTC intervals).
- DST transitions:
  - Nonexistent local time: shift to next valid local time.
  - Ambiguous local time: choose earliest offset consistently.
- Timezone change on recurring series should be treated as `THIS_AND_FOLLOWING` split to preserve past occurrence identity.

## 10. Concurrency, Integrity, and Idempotency
- Use optimistic concurrency (`version`) on `sessions` and `sessionExceptions`.
- Mutation input should carry `expectedVersion` where applicable.
- Use client mutation idempotency keys for retry-safe writes.
- Projection generation should be version-aware (`generationVersion`) to avoid stale overwrites.

## 11. Authorization and Audit
- Reuse studio ownership/membership authorization at mutation/query boundaries.
- Track `createdBy/updatedBy` and timestamps on all canonical rows.
- Prefer soft delete for audit trail and recovery.
- Participant-specific authorization:
  - Organizer/manager can invite/remove participants and edit session details.
  - A participant can update only their own RSVP response.
  - A participant cannot invite other participants.
  - Participants can view the full participant list for sessions they are part of.

## 11.1 RSVP Semantics (future-ready)
- Default RSVP lives on participant row (`defaultRsvp`) and applies to all occurrences.
- `THIS_EVENT` RSVP: upsert one row in `sessionRsvpOverrides`.
- `ALL_EVENTS` RSVP: update `defaultRsvp` and remove obsolete overrides.
- `THIS_AND_FOLLOWING` RSVP (optional advanced):
  - Add response policy rows with `effectiveFromRecurrenceIdUtc`, or
  - Reuse split-style approach by closing old default and creating a new effective default from selected occurrence.

## 12. Rollout Plan
1. Add canonical tables and write-path mutations for create/edit/delete semantics.
2. Add projection table and generation worker logic.
3. Switch calendar read path to projection-backed query.
4. Backfill projection for existing sessions.
5. Enable advanced split/remap behavior for `THIS_AND_FOLLOWING`.

## 13. Testing Strategy
- Unit tests:
  - Recurrence expansion correctness.
  - `THIS_EVENT`, `THIS_AND_FOLLOWING`, `ALL_EVENTS` semantics.
  - Split/remap behavior for edited/deleted future instances.
- Edge-case tests:
  - DST boundary weeks.
  - Monthly rules on short months.
  - Count- and until-bounded recurrences.
- Concurrency tests:
  - Concurrent edits against same series/occurrence.
- Integration tests:
  - Create recurring series, edit one occurrence, edit following, delete scopes, and verify query output.

## 14. Open Decisions (Need Product Confirmation)
- None currently.
