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

/** Aman untuk lembur: otomatis ditutup setelah jendela lembur 3 jam berlalu. */
export function getAutoCloseShift(now = new Date()): { shift: ShiftNumber; date: string } | null {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).reduce<Record<string, string>>((result, part) => {
    result[part.type] = part.value
    return result
  }, {})
  const time = Number(parts.hour) * 60 + Number(parts.minute)
  const date = `${parts.year}-${parts.month}-${parts.day}`
  if (time >= 510 && time < 540) return { shift: 2, date: getWorkDate(2, now) }
  if (parts.weekday === 'Fri' && time >= 1230 && time < 1260) return { shift: 1, date }
  if (['Mon', 'Tue', 'Wed', 'Thu'].includes(parts.weekday) && time >= 1170 && time < 1200) return { shift: 1, date }
  return null
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
