import assert from 'node:assert/strict'
import test from 'node:test'
import {
  archiveMatchesShift,
  displayShiftSlot,
  getAutoCloseShift,
  getShiftSlots,
  getWorkDate,
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

test('automatic close waits for the maximum overtime window', () => {
  assert.deepEqual(getAutoCloseShift(new Date('2026-08-31T12:45:00Z')), { shift: 1, date: '2026-08-31' })
  assert.deepEqual(getAutoCloseShift(new Date('2026-09-01T01:45:00Z')), { shift: 2, date: '2026-08-31' })
  assert.equal(getAutoCloseShift(new Date('2026-08-31T10:00:00Z')), null)
})
