# Shift and Data Integrity Hardening

## Goal

Make hourly input and shift closing use one consistent two-shift schedule, prevent duplicate archives and invalid line/model data, and keep role-based reporting within assigned lines.

## Shift schedule

The database continues storing an integer hourly slot. Labels provide the actual half-hour schedule.

### Shift 1

- Normal day: 07:30–16:30.
- Break: 12:30–13:30.
- Friday: 07:30–17:00.
- Friday break: 11:30–13:00.
- Overtime: one, two, or three hourly slots after the normal end.

### Shift 2

- Normal: 20:30–05:30 on the following calendar day.
- Default break: 00:30–01:30.
- Overtime: one, two, or three hourly slots after 05:30.
- There is no separate third “night shift.”

All schedules, labels, slot lists, shift detection, and work-date calculations must come from `lib/shifts.ts`. The default Shift 2 break can be changed there if factory policy changes. An admin schedule editor is out of scope.

## Shift archive identity

`ShiftArchive` gains a normalized `shift` integer (`1` or `2`). The database enforces uniqueness on `(lineId, date, shift)`.

Existing rows are backfilled from `shiftLabel`: labels containing `2`, `malam`, or `night` become Shift 2; all others become Shift 1. The display label remains for historical readability, but business logic uses the normalized number.

A deployment migration must add and backfill the column before making it required and adding the unique constraint. Duplicate legacy archives, if any, must be reported rather than silently deleted.

## Closing flow

The client sends the normalized shift currently displayed. Fixed shift props take precedence over local component state.

The server:

1. Validates session, role, line access, date, and shift.
2. Loads only actuals whose slot belongs to the requested shift.
3. Creates the unique archive and marks only those actuals closed in one transaction.
4. Resolves only alerts attributable to the closed work date and shift once alert attribution exists. Until then, closing a shift must not resolve every line alert.
5. Sends email only after the transaction commits.
6. Updates `emailSent` after a successful send.

Concurrent close requests are resolved by the database unique constraint; the loser receives HTTP 409 without producing a second archive.

## Actual input integrity

Before upsert, the API must verify that:

- The line exists and the user can access it.
- The section exists.
- The section’s model has an active assignment on the selected line.
- The corresponding shift archive does not already exist.

Invalid combinations return HTTP 400 or 409 and never write an `Actual` row. Offline sync keeps treating 4xx responses as permanent failures.

## Reporting access

All production reads use the same effective line scope:

- Team Leader: only `UserLine` assignments.
- Building-scoped Management: lines in their building.
- Global authorized roles: all permitted lines.

Daily export and analytics summary must reuse this scope instead of relying only on `user.building`.

## Cache consistency

Every mutation affecting cached TV standard data—section data, assignment, model metadata, image, activation, or deletion—revalidates the existing `sections-std` tag. No new cache layer is introduced.

## Verification

Add a small runnable test using Node’s built-in test runner through the already-installed `tsx` package. It covers:

- Shift 1 normal, Friday, and 1–3 hour overtime slots.
- Shift 2 normal slots, midnight break, and 1–3 hour overtime slots.
- Shift detection and work-date behavior across midnight.
- Label normalization for legacy archives.

Database-backed checks cover unique shift archives and rejection of a section not assigned to a line when a test database is available. Required final checks are the focused tests, Prisma validation/generation, and the production build.

## Out of scope

- A third shift.
- A schedule administration page.
- MES/barcode integration.
- Deleting or rewriting historical production data automatically.
