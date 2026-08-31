import assert from 'node:assert/strict'
import test from 'node:test'
import { ActualUpsertSchema, ShiftCloseSchema } from '../lib/validation'

test('shift close accepts only numeric Shift 1 or Shift 2', () => {
  assert.equal(ShiftCloseSchema.safeParse({ lineId: 'line-1', shift: 2 }).success, true)
  assert.equal(ShiftCloseSchema.safeParse({ lineId: 'line-1', shiftLabel: 'Shift Malam' }).success, false)
  assert.equal(ShiftCloseSchema.safeParse({ lineId: 'line-1', shift: 3 }).success, false)
})

test('actual input rejects break and out-of-range slots', () => {
  const input = {
    lineId: 'line-1', sectionId: 'section-1', date: '2026-08-21',
    output: 100, mpActual: 10,
  }
  assert.equal(ActualUpsertSchema.safeParse({ ...input, hour: 31 }).success, true)
  assert.equal(ActualUpsertSchema.safeParse({ ...input, hour: 24 }).success, false)
  assert.equal(ActualUpsertSchema.safeParse({ ...input, hour: 32 }).success, false)
})
