# Shift and Data Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make two-shift input, closing, archives, reporting access, and TV cache behavior consistent and safe.

**Architecture:** `lib/shifts.ts` becomes the only source for schedule and shift classification. PostgreSQL owns archive uniqueness, API routes validate relationships at their trust boundaries, and existing authorization/cache helpers are extended rather than adding new layers.

**Tech Stack:** Next.js 14, TypeScript, Node built-in test runner via `tsx`, Prisma 5, PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-08-21-shift-and-data-integrity-design.md`

## Global Constraints

- Keep exactly two shifts; do not add a third “night shift.”
- Keep integer hourly slots in `Actual.hour`.
- Shift 1 normal is 07:30–16:30 with break 12:30–13:30.
- Shift 1 Friday is 07:30–17:00 with break 11:30–13:00.
- Shift 2 normal is 20:30–05:30 with default break 00:30–01:30.
- Overtime adds zero through three hourly slots after normal shift end.
- Do not add dependencies or an admin schedule editor.
- Do not silently delete or rewrite duplicate historical archives.

---

### Task 1: Central shift schedule and runnable tests

**Files:**
- Modify: `lib/shifts.ts`
- Modify: `lib/utils.ts:15-85`
- Create: `tests/shifts.test.ts`
- Modify: `package.json:6-13`

**Interfaces:**
- Produces: `type ShiftNumber = 1 | 2`
- Produces: `getShiftSlots(shift: ShiftNumber, options?: { friday?: boolean; overtimeHours?: 0 | 1 | 2 | 3 }): number[]`
- Produces: `displayShiftSlot(hour: number, options?: { friday?: boolean }): string`
- Produces: existing `shiftNumberFromHour()`, `shiftNumberFromLabel()`, and `archiveMatchesShift()` with centralized constants.
- Produces: `getWorkDate(shift: ShiftNumber, now?: Date): string` using Asia/Jakarta.
- Consumes: no database state.

- [ ] **Step 1: Add the test command and failing schedule tests**

Add to `package.json`:

```json
"test": "tsx --test tests/*.test.ts"
```

Create `tests/shifts.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  archiveMatchesShift,
  displayShiftSlot,
  getWorkDate,
  getShiftSlots,
  shiftNumberFromHour,
  shiftNumberFromLabel,
} from '../lib/shifts'

test('Shift 1 normal and overtime slots', () => {
  assert.deepEqual(getShiftSlots(1), [7, 8, 9, 10, 11, 13, 14, 15])
  assert.deepEqual(getShiftSlots(1, { overtimeHours: 3 }), [7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18])
})

test('Shift 1 Friday uses longer break and 17:00 overtime start', () => {
  assert.deepEqual(getShiftSlots(1, { friday: true }), [7, 8, 9, 10, 13, 14, 15, 16])
  assert.deepEqual(getShiftSlots(1, { friday: true, overtimeHours: 3 }), [7, 8, 9, 10, 13, 14, 15, 16, 17, 18, 19])
})

test('Shift 2 skips midnight break and appends overtime', () => {
  assert.deepEqual(getShiftSlots(2), [20, 21, 22, 23, 25, 26, 27, 28])
  assert.deepEqual(getShiftSlots(2, { overtimeHours: 3 }), [20, 21, 22, 23, 25, 26, 27, 28, 29, 30, 31])
})

test('labels and legacy archives normalize to two shifts', () => {
  assert.equal(shiftNumberFromHour(19), 1)
  assert.equal(shiftNumberFromHour(20), 2)
  assert.equal(shiftNumberFromLabel('Shift 2'), 2)
  assert.equal(shiftNumberFromLabel('Shift Malam (23:00–07:00)'), 2)
  assert.equal(archiveMatchesShift('Shift 1', 1), true)
})

test('slot labels preserve half-hour factory schedule', () => {
  assert.equal(displayShiftSlot(7), '07:30 – 08:30')
  assert.equal(displayShiftSlot(20), '20:30 – 21:30')
  assert.equal(displayShiftSlot(25), '01:30 – 02:30')
  assert.equal(displayShiftSlot(29), '05:30 – 06:30')
})

test('Shift 2 after midnight keeps the previous production date', () => {
  assert.equal(getWorkDate(2, new Date('2026-08-21T01:00:00+07:00')), '2026-08-20')
  assert.equal(getWorkDate(1, new Date('2026-08-21T08:00:00+07:00')), '2026-08-21')
})
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm.cmd test`

Expected: FAIL because `getShiftSlots` and `displayShiftSlot` are not exported.

- [ ] **Step 3: Implement the minimum centralized schedule**

In `lib/shifts.ts`, define the slot arrays and functions:

```ts
export type ShiftNumber = 1 | 2
export type OvertimeHours = 0 | 1 | 2 | 3

const SHIFT1 = [7, 8, 9, 10, 11, 13, 14, 15]
const SHIFT1_FRIDAY = [7, 8, 9, 10, 13, 14, 15, 16]
const SHIFT1_OT = [16, 17, 18]
const SHIFT1_FRIDAY_OT = [17, 18, 19]
const SHIFT2 = [20, 21, 22, 23, 25, 26, 27, 28]
const SHIFT2_OT = [29, 30, 31]

export function getShiftSlots(
  shift: ShiftNumber,
  { friday = false, overtimeHours = 0 }: { friday?: boolean; overtimeHours?: OvertimeHours } = {},
) {
  const normal = shift === 2 ? SHIFT2 : friday ? SHIFT1_FRIDAY : SHIFT1
  const overtime = shift === 2 ? SHIFT2_OT : friday ? SHIFT1_FRIDAY_OT : SHIFT1_OT
  return [...normal, ...overtime.slice(0, overtimeHours)]
}
```

Implement `displayShiftSlot()` with a fixed label map in this same file. Move or delegate the old Shift 1 utilities in `lib/utils.ts` to these functions so existing callers keep working during this task.

Implement `getWorkDate()` by formatting `now` in `Asia/Jakarta`; for Shift 2 before 09:00, format `now - 24 hours`. This keeps post-midnight production on the date when Shift 2 started without introducing a date library.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `npm.cmd test`

Expected: 6 tests pass, 0 fail.

- [ ] **Step 5: Commit the schedule boundary**

```powershell
git add package.json package-lock.json lib/shifts.ts lib/utils.ts tests/shifts.test.ts
git commit -m "fix: centralize factory shift schedule"
```

---

### Task 2: Make the UI submit exactly the displayed shift

**Files:**
- Modify: `components/CloseShiftButton.tsx:5-151`
- Modify: `app/(dashboard)/leader/client.tsx:18-63,617-623`
- Modify: `lib/i18n.tsx` only for existing close-shift labels.

**Interfaces:**
- Consumes: `ShiftNumber`, `OvertimeHours`, `getShiftSlots()`, and `displayShiftSlot()` from Task 1.
- Produces: `CloseShiftButton` prop `fixedShift?: ShiftNumber`; POST body `{ lineId, shift, managerEmail, date? }`.

- [ ] **Step 1: Replace the ambiguous three-option UI with two numeric options**

Use this shape in `CloseShiftButton.tsx`:

```ts
interface Props {
  lineId: string
  lineLabel: string
  onClosed?: () => void
  workDate?: string
  fixedShift?: ShiftNumber
  hideEmail?: boolean
}

const SHIFTS: { value: ShiftNumber; key: string }[] = [
  { value: 1, key: 'closeShiftBtn.shift1' },
  { value: 2, key: 'closeShiftBtn.shift2' },
]
```

The request must use the prop directly when fixed:

```ts
const submittedShift = fixedShift ?? shift
body: JSON.stringify({ lineId, shift: submittedShift, managerEmail: email, ...(workDate ? { date: workDate } : {}) })
```

Delete the third “Shift Malam” option. Display `Shift ${fixedShift}` for fixed mode.

- [ ] **Step 2: Replace local Shift 2 arrays with shared schedule calls**

In `leader/client.tsx`, delete `SHIFT2_HOURS`, `SHIFT2_OT_HOURS`, and the local `displayHour`. Track OT as `0 | 1 | 2 | 3` rather than a boolean and derive:

```ts
const activeHours = getShiftSlots(shift, { friday, overtimeHours })
```

Render four existing-button-style choices: Normal, OT 1 jam, OT 2 jam, OT 3 jam. Use `displayShiftSlot(hour, { friday })` for labels.

```tsx
{([0, 1, 2, 3] as const).map(hours => (
  <button key={hours} type="button" onClick={() => setOvertimeHours(hours)}>
    {hours === 0 ? 'Normal' : `OT ${hours} jam`}
  </button>
))}
```

- [ ] **Step 3: Update the close caller**

```tsx
<CloseShiftButton
  lineId={line.id}
  lineLabel={`Gedung ${line.building} — Line ${line.lineNo}`}
  workDate={getWorkDate(shift)}
  fixedShift={shift}
  hideEmail
  onClosed={() => window.location.reload()}
/>
```

- [ ] **Step 4: Verify schedule tests and production compilation**

Run: `npm.cmd test`

Expected: all shift tests pass.

Run: `npx.cmd tsc --noEmit`

Expected: exit 0.

- [ ] **Step 5: Commit the client fix**

```powershell
git add components/CloseShiftButton.tsx 'app/(dashboard)/leader/client.tsx' lib/i18n.tsx
git commit -m "fix: submit the displayed production shift"
```

---

### Task 3: Normalize and uniquely constrain shift archives

**Files:**
- Modify: `prisma/schema.prisma:178-194`
- Create: `prisma/migrations/20260821_shift_archive_identity/migration.sql`
- Modify: `lib/validation.ts:125-133`
- Modify: `app/api/shift-close/route.ts`
- Modify: `app/api/actuals/route.ts:64-77`
- Modify: `lib/shift-archive-query.ts`
- Modify: `app/api/shift-archive/detail/route.ts`
- Modify: `app/(dashboard)/history/page.tsx`

**Interfaces:**
- Consumes: numeric `ShiftNumber` from Task 1 and numeric request body from Task 2.
- Produces: required `ShiftArchive.shift: Int` and Prisma compound unique key `lineId_date_shift`.

- [ ] **Step 1: Add normalized shift to Prisma schema**

```prisma
model ShiftArchive {
  // existing fields
  shift Int

  @@unique([lineId, date, shift])
  @@index([closedAt])
}
```

- [ ] **Step 2: Write a migration that refuses ambiguous legacy data**

Create `migration.sql`:

```sql
ALTER TABLE "ShiftArchive" ADD COLUMN "shift" INTEGER;

UPDATE "ShiftArchive"
SET "shift" = CASE
  WHEN "shiftLabel" ~* '(^|[^0-9])2([^0-9]|$)|malam|night' THEN 2
  ELSE 1
END;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "ShiftArchive"
    GROUP BY "lineId", "date", "shift"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate ShiftArchive rows exist; review them before migration';
  END IF;
END $$;

ALTER TABLE "ShiftArchive" ALTER COLUMN "shift" SET NOT NULL;
CREATE UNIQUE INDEX "ShiftArchive_lineId_date_shift_key"
ON "ShiftArchive"("lineId", "date", "shift");
```

- [ ] **Step 3: Validate numeric shift at the API boundary**

Replace free-form input with:

```ts
shift: z.union([z.literal(1), z.literal(2)]),
```

The server derives `shiftLabel = `Shift ${shift}``. Archive checks use `findUnique({ where: { lineId_date_shift: { lineId, date, shift } } })`.

- [ ] **Step 4: Make close transactional before email**

Within the transaction, create the archive and update only actuals whose hours belong to `getShiftSlots(shift, { friday, overtimeHours: 3 })`. Remove the unconditional alert `updateMany` because alerts currently lack date/shift attribution.

Catch Prisma `P2002` and return HTTP 409. After commit, send email. If email succeeds:

```ts
await prisma.shiftArchive.update({
  where: { id: archive.id },
  data: { emailSent: true },
})
```

- [ ] **Step 5: Switch archive reads and actual locking to numeric shift**

Use `shift` directly in `actuals`, archive list, and detail routes. Return `shift` from `queryShiftArchives()`, add it to the history row type, and request archive detail with `shift=${archive.shift}` rather than `shiftLabel`. Keep `shiftNumberFromLabel()` only for migration-era display fallback; new logic must not parse labels.

- [ ] **Step 6: Validate schema and build types**

Run: `npx.cmd prisma validate`

Expected: schema valid.

Run: `npx.cmd prisma generate`

Expected: client generated with `ShiftArchive.shift` and compound unique input.

Run: `npx.cmd tsc --noEmit`

Expected: exit 0.

- [ ] **Step 7: Commit archive integrity**

```powershell
git add prisma/schema.prisma prisma/migrations/20260821_shift_archive_identity/migration.sql lib/validation.ts app/api/shift-close/route.ts app/api/actuals/route.ts lib/shift-archive-query.ts app/api/shift-archive/detail/route.ts 'app/(dashboard)/history/page.tsx'
git commit -m "fix: enforce one archive per production shift"
```

---

### Task 4: Reject line/model/section mismatches

**Files:**
- Modify: `app/api/actuals/route.ts:79-94`

**Interfaces:**
- Consumes: `lineId` and `sectionId` from validated request input.
- Produces: HTTP 400 before writes when the section’s model lacks an active assignment on the line.

- [ ] **Step 1: Replace the post-write section lookup with a pre-write relationship query**

Before `actual.upsert`, query:

```ts
const section = await prisma.section.findFirst({
  where: {
    id: sectionId,
    model: { assignments: { some: { lineId, active: true } } },
  },
  include: { model: true },
})
if (!section) {
  return jsonError('Section/model tidak aktif pada line ini.', 400)
}
```

Reuse this `section` for alert calculation; delete the later `findUnique` query.

- [ ] **Step 2: Verify no write precedes relationship validation**

Run:

```powershell
rg -n "section.findFirst|actual.upsert" app/api/actuals/route.ts
```

Expected: `section.findFirst` appears before `actual.upsert`.

Run: `npx.cmd tsc --noEmit`

Expected: exit 0.

- [ ] **Step 3: Commit input integrity**

```powershell
git add app/api/actuals/route.ts
git commit -m "fix: validate actual section assignment"
```

---

### Task 5: Centralize production read scope

**Files:**
- Modify: `lib/api-helpers.ts`
- Modify: `app/api/export/daily/route.ts:7-33`
- Modify: `app/api/analytics/summary/route.ts:5-38`

**Interfaces:**
- Produces: `getAccessibleLineWhere(session: Session, requestedBuilding?: string | null): Promise<Prisma.LineWhereInput>`.
- Consumes: authenticated NextAuth session.

- [ ] **Step 1: Add one shared line filter**

```ts
export async function getAccessibleLineWhere(
  session: Session,
  requestedBuilding?: string | null,
): Promise<Prisma.LineWhereInput> {
  if (session.user.role === 'TEAM_LEADER') {
    const rows = await prisma.userLine.findMany({
      where: { userId: session.user.id },
      select: { lineId: true },
    })
    return { id: { in: rows.map(r => r.lineId) } }
  }
  const building = session.user.building ??
    (requestedBuilding && requestedBuilding !== 'ALL' ? requestedBuilding : null)
  return building ? { building } : {}
}
```

Import `Prisma` from `@prisma/client`.

- [ ] **Step 2: Apply the filter to daily export**

```ts
const lineWhere = await getAccessibleLineWhere(session)
const lines = await prisma.line.findMany({
  where: { active: true, ...lineWhere },
  // existing include/orderBy
})
```

- [ ] **Step 3: Apply the same filter to analytics actuals**

Build `lineWhere` with the requested building, then query actuals using `line: lineWhere` while preserving the date range.

- [ ] **Step 4: Verify type safety**

Run: `npx.cmd tsc --noEmit`

Expected: exit 0.

- [ ] **Step 5: Commit access consistency**

```powershell
git add lib/api-helpers.ts app/api/export/daily/route.ts app/api/analytics/summary/route.ts
git commit -m "fix: scope production reports by assigned lines"
```

---

### Task 6: Complete cache invalidation and final verification

**Files:**
- Modify: `app/api/models/[id]/route.ts`
- Modify: `app/api/models/upload-image/route.ts`

**Interfaces:**
- Consumes: existing `revalidateTag('sections-std')` cache tag.
- Produces: immediate TV refresh eligibility after model metadata, image, activation, or deletion changes.

- [ ] **Step 1: Revalidate after every successful cached model mutation**

Import `revalidateTag` in the upload-image route. Call:

```ts
revalidateTag('sections-std')
```

after metadata PATCH, soft DELETE, image POST, and image DELETE succeed. Do not add another cache tag.

- [ ] **Step 2: Run all focused and production checks**

Run: `npm.cmd test`

Expected: all tests pass, 0 fail.

Run: `npx.cmd prisma validate`

Expected: schema valid.

Run: `npm.cmd run build`

Expected: exit 0 after TypeScript, lint, and production page generation.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 3: Inspect final scope**

Run: `git status --short` and `git log --oneline -8`.

Expected: only `.claude/settings.local.json` remains untracked; implementation commits appear after the design/plan commits.

- [ ] **Step 4: Commit cache completion if it was not included earlier**

```powershell
git add app/api/models/[id]/route.ts app/api/models/upload-image/route.ts
git commit -m "fix: refresh TV cache after model changes"
```
