import { type ClassValue, clsx } from 'clsx'

export function cn(...inputs: ClassValue[]) { return clsx(inputs) }

export const BUILDINGS: Record<string, number> = { C: 1, D: 6, E: 6, F: 5, H: 5, I: 4, G: 7 }
export const STOCKFIT_BUILDING = 'G'
export const SECTIONS = ['Cutting', 'Treatment', 'Preparation', 'PC Sewing', 'Sewing', 'Assembly', 'Packing']
export const SF_SECTIONS = ['Buffing', 'UV', 'Stockfit']
export const LINE_TYPES = {
  MINI: { label: 'Mini Line', tph: 100, takt: 36 },
  BIG:  { label: 'Big Line',  tph: 180, takt: 20 },
}

export function getGWT(op: { va: number; nvan: number; nva: number; allowance: number }) {
  return parseFloat(((op.va + op.nvan + op.nva) * (1 + op.allowance)).toFixed(2))
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