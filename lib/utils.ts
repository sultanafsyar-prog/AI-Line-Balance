import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }

export const BUILDINGS: Record<string, number> = { C: 1, D: 6, E: 6, F: 5, H: 5, I: 4, G: 7 }
export const STOCKFIT_BUILDING = 'G'
export const SECTIONS = ['Cutting', 'Treatment', 'Preparation', 'PC Sewing', 'Sewing', 'Assembly', 'Packing']
export const SF_SECTIONS = ['Buffing', 'UV', 'Stockfit']
export const LINE_TYPES = {
  MINI: { label: 'Mini Line', tph: 100, takt: 36 },
  BIG:  { label: 'Big Line',  tph: 180, takt: 20 },
}

// ─── SHIFT SCHEDULE ──────────────────────────────────────────
// Shift 1: 07:30 – 16:30 (regular) / 07:30 – 17:00 (Jumat)
// 8 jam kerja + istirahat (1 jam regular, 1.5 jam Jumat)
//
// `hour` field di DB tetap integer (7,8,9,...) = jam mulai slot.
// Display helper mengkonversi ke format "07:30 – 08:30".

// Slot mapping: hour → { label, start, end }
export const SHIFT1_REGULAR: Record<number, string> = {
  7:  '07:30 – 08:30',
  8:  '08:30 – 09:30',
  9:  '09:30 – 10:30',
  10: '10:30 – 11:30',
  11: '11:30 – 12:30',
  // ISTIRAHAT 12:30 – 13:30
  13: '13:30 – 14:30',
  14: '14:30 – 15:30',
  15: '15:30 – 16:30',
}

export const SHIFT1_FRIDAY: Record<number, string> = {
  7:  '07:30 – 08:30',
  8:  '08:30 – 09:30',
  9:  '09:30 – 10:30',
  10: '10:30 – 11:30',
  // ISTIRAHAT 11:30 – 13:00 (Jumat)
  13: '13:00 – 14:00',
  14: '14:00 – 15:00',
  15: '15:00 – 16:00',
  16: '16:00 – 17:00',
}

export const SHIFT1_OT: Record<number, string> = {
  16: '16:30 – 17:30',
  17: '17:30 – 18:30',
  18: '18:30 – 19:30',
}

export const SHIFT1_OT_FRIDAY: Record<number, string> = {
  17: '17:00 – 18:00',
  18: '18:00 – 19:00',
  19: '19:00 – 20:00',
}

// Cek apakah hari ini Jumat (Asia/Jakarta)
export function isFridayWIB(dateStr?: string): boolean {
  if (dateStr) {
    return new Date(dateStr + 'T00:00:00+07:00').getDay() === 5
  }
  const d = new Date()
  const dayStr = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Jakarta' })
  return dayStr === 'Fri'
}

// Ambil jam kerja Shift 1 (array of hour numbers)
export function getShift1Hours(friday?: boolean): number[] {
  const f = friday ?? isFridayWIB()
  return Object.keys(f ? SHIFT1_FRIDAY : SHIFT1_REGULAR).map(Number)
}

export function getShift1OTHours(friday?: boolean): number[] {
  const f = friday ?? isFridayWIB()
  return Object.keys(f ? SHIFT1_OT_FRIDAY : SHIFT1_OT).map(Number)
}

// Display label untuk jam tertentu (aware hari Jumat)
export function displayHourLabel(h: number, friday?: boolean): string {
  const f = friday ?? isFridayWIB()
  const regular = f ? SHIFT1_FRIDAY : SHIFT1_REGULAR
  const ot = f ? SHIFT1_OT_FRIDAY : SHIFT1_OT
  return regular[h] ?? ot[h] ?? `${String(h > 23 ? h - 24 : h).padStart(2, '0')}:00`
}


export function getGWT(op: { va: number; nvan: number; nva: number; allowance: number }) {
  return parseFloat(((op.va + op.nvan + op.nva) * (1 + op.allowance)).toFixed(2))
}

// ─── LLER UNIFIED ─────────────────────────────────────────
// LLER produktivitas gabungan (standardized across all pages):
//   LLER = (actualPPH × actualMP) / (theoPPH × theoMP) × 100
// Mengukur efisiensi gabungan: output achievement DAN manpower utilization.
// Output rendah tapi MP juga rendah → LLER masih rendah (lebih akurat
// dibanding rumus terpisah yang bisa misleading saat understaffed).
//
// Fallback ke stdMP jika theoMP tidak tersedia (untuk endpoint API ringan
// yang tidak include operations).
export function calcLLER(
  actualPPH: number,
  actualMP: number,
  theoPPH: number,
  theoMP: number
): number {
  if (actualPPH <= 0 || actualMP <= 0 || theoPPH <= 0 || theoMP <= 0) return 0
  return Math.round((actualPPH * actualMP) / (theoPPH * theoMP) * 100)
}

export function calcSectionMetrics(ops: any[], stdMP: number, takt: number) {
  const rows = ops.map(op => {
    const gwt        = getGWT(op)
    const mpNeeded   = takt > 0 ? Math.ceil(gwt / takt) : 1        // MP dibutuhkan per operasi
    const effectiveCT = parseFloat((gwt / mpNeeded).toFixed(2))     // CT efektif setelah dibagi MP
    return { ...op, gwt, mpNeeded, effectiveCT }
  })
  const totalGWT  = parseFloat(rows.reduce((s, r) => s + r.gwt, 0).toFixed(2))
  const theorMP   = takt > 0 ? parseFloat((totalGWT / takt).toFixed(1)) : 0
  const lbr       = stdMP > 0 ? parseFloat((theorMP / stdMP * 100).toFixed(1)) : 0
  // maxGwtOp = operasi dengan GWT tertinggi (untuk info, BUKAN "bottleneck")
  const maxGwtOp  = rows.reduce((m, r) => r.gwt > m.gwt ? r : m, rows[0] ?? { gwt: 0, name: '-', mpNeeded: 1, effectiveCT: 0 })
  // Backward compat: `bottleneck` tetap di-expose untuk kode lama yang masih pakai
  return { rows, totalGWT, theorMP, lbr, maxGwtOp, bottleneck: maxGwtOp }
}

export function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Tanggal hari ini dalam format YYYY-MM-DD, zona waktu Asia/Jakarta (UTC+7).
 * Penting: jangan pakai toISOString().slice(0,10) — itu UTC, jam 00:00-07:00 WIB
 * akan tercatat sebagai tanggal kemarin.
 */
export function today() {
  // en-CA locale menghasilkan format YYYY-MM-DD
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

// ─── ROLE HELPERS ────────────────────────────────────────────
export type UserRole = 'IE_ADMIN' | 'IE_OPERATOR' | 'TEAM_LEADER' | 'MANAGEMENT' | 'IT_ADMIN' | 'PPIC'

export function isIE(role?: string)          { return role === 'IE_ADMIN' || role === 'IE_OPERATOR' }
export function isTeamLeader(role?: string)  { return role === 'TEAM_LEADER' }
export function isManagement(role?: string)  { return role === 'MANAGEMENT' }
export function isAdmin(role?: string)       { return role === 'IE_ADMIN' || role === 'IT_ADMIN' }
export function isPPIC(role?: string)        { return role === 'PPIC' }
export function canInputActual(role?: string){ return role === 'TEAM_LEADER' || isIE(role) }
export function canManageModels(role?: string){ return isIE(role) }
export function canViewAll(role?: string)    { return isIE(role) || role === 'IT_ADMIN' }

export const ROLE_LABELS: Record<string, string> = {
  IE_ADMIN:    'IE Admin',
  IE_OPERATOR: 'IE Operator',
  TEAM_LEADER: 'Team Leader',
  MANAGEMENT:  'Manager',
  IT_ADMIN:    'IT Admin',
  PPIC:        'PPIC',
}

export const ROLE_COLORS: Record<string, string> = {
  IE_ADMIN:    'badge-bad',
  IE_OPERATOR: 'badge-warn',
  TEAM_LEADER: 'badge-info',
  MANAGEMENT:  'badge-ok',
  IT_ADMIN:    'badge-warn',
  PPIC:        'badge-info',
}