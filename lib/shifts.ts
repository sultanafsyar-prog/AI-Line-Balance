export type ShiftNumber = 1 | 2

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
