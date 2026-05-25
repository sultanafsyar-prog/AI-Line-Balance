import { type ClassValue, clsx } from 'clsx'

export function cn(...inputs: ClassValue[]) { return clsx(inputs) }

export const BUILDINGS: Record<string, number> = { C: 1, D: 6, E: 6, F: 5, H: 5, I: 4, G: 7 }
export const STOCKFIT_BUILDING = 'G'
export const SECTIONS = ['Cutting', 'Treatment', 'Preparation', 'PC Sewing', 'Sewing', 'Assembly', 'Packing']
export const SF_SECTIONS = ['Stockfit']
export const LINE_TYPES = {
  MINI: { label: 'Mini Line', tph: 100, takt: 36 },
  BIG:  { label: 'Big Line',  tph: 180, takt: 20 },
}

export function getGWT(op: { va: number; nvan: number; nva: number; allowance: number }) {
  return parseFloat(((op.va + op.nvan + op.nva) * (1 + op.allowance)).toFixed(2))
}

export function calcSectionMetrics(ops: any[], stdMP: number, takt: number) {
  const rows = ops.map(op => ({ ...op, gwt: getGWT(op) }))
  const totalGWT = parseFloat(rows.reduce((s, r) => s + r.gwt, 0).toFixed(2))
  const theorMP  = parseFloat((totalGWT / takt).toFixed(2))
  const lbr      = stdMP > 0 ? parseFloat((theorMP / stdMP * 100).toFixed(1)) : 0
  const bottleneck = rows.reduce((m, r) => r.gwt > m.gwt ? r : m, rows[0] ?? { gwt: 0, name: '-' })
  return { rows, totalGWT, theorMP, lbr, bottleneck }
}

export function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function today() { return new Date().toISOString().slice(0, 10) }

// Role helpers
export type UserRole = 'IE_ADMIN' | 'IE_OPERATOR' | 'PRODUCTION_SUPERVISOR' | 'PRODUCTION_OPERATOR' | 'MANAGEMENT' | 'IT_ADMIN'

export function isIE(role?: string) { return role === 'IE_ADMIN' || role === 'IE_OPERATOR' }
export function isProduction(role?: string) { return role === 'PRODUCTION_SUPERVISOR' || role === 'PRODUCTION_OPERATOR' }
export function canInputActual(role?: string) { return isProduction(role) || isIE(role) }
export function canManageModels(role?: string) { return isIE(role) }

export const ROLE_LABELS: Record<string, string> = {
  IE_ADMIN: 'IE Admin', IE_OPERATOR: 'IE Operator',
  PRODUCTION_SUPERVISOR: 'Supervisor', PRODUCTION_OPERATOR: 'Operator',
  MANAGEMENT: 'Management', IT_ADMIN: 'IT Admin',
}
