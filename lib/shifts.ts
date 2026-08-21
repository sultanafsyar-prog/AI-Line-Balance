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

function clock(minutes: number) {
  const value = minutes % (24 * 60)
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

export function displayShiftSlot(hour: number, { friday = false }: { friday?: boolean } = {}) {
  const startMinutes = hour * 60 + (friday && hour >= 13 && hour <= 19 ? 0 : 30)
  return `${clock(startMinutes)} – ${clock(startMinutes + 60)}`
}

export function getWorkDate(shift: ShiftNumber, now = new Date()) {
  const hour = Number(now.toLocaleTimeString('en-US', {
    hour: '2-digit', hour12: false, timeZone: 'Asia/Jakarta',
  }).split(':')[0])
  const workDate = shift === 2 && hour < 9 ? new Date(now.getTime() - 86_400_000) : now
  return workDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

/** Shift 2 memakai jam virtual 20-32 untuk produksi lintas tengah malam. */
export function shiftNumberFromLabel(label: string): ShiftNumber {
  return /(?:\b2\b|malam|night)/i.test(label) ? 2 : 1
}

export function shiftNumberFromHour(hour: number): ShiftNumber {
  return hour >= 20 ? 2 : 1
}

export function archiveMatchesShift(label: string, shift: ShiftNumber): boolean {
  return shiftNumberFromLabel(label) === shift
}
