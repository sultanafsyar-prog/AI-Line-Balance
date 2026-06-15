import { z } from 'zod'

// ─── ENUMS ──────────────────────────────────────────────────
export const RoleSchema = z.enum([
  'IE_ADMIN', 'IE_OPERATOR', 'TEAM_LEADER', 'MANAGEMENT', 'IT_ADMIN', 'PPIC',
])

export const LineTypeSchema = z.enum(['MINI', 'BIG'])

// ─── PRIMITIVES ─────────────────────────────────────────────
const dateString = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  'Format tanggal harus YYYY-MM-DD',
)

const cuid = z.string().min(1, 'ID wajib diisi')

const nonNegInt = z.number().int().min(0)
const positiveInt = z.number().int().positive()

// ─── ACTUALS ────────────────────────────────────────────────
export const ActualUpsertSchema = z.object({
  lineId:    cuid,
  sectionId: cuid,
  date:      dateString,
  hour:      z.number().int().min(0).max(23),
  output:    nonNegInt.max(10000, 'Output terlalu besar (>10000)'),
  mpActual:  nonNegInt.max(500, 'MP terlalu besar (>500)'),
  downtime:  nonNegInt.max(480, 'Downtime > 8 jam tidak masuk akal').optional().default(0),
  dtReason:  z.string().max(500).optional().nullable(),
  defect:    nonNegInt.max(10000).optional().default(0),
  modelId:   cuid.optional(), // tidak dipakai, ada di payload lama
})
export type ActualUpsertInput = z.infer<typeof ActualUpsertSchema>

// ─── OPERATIONS & SECTIONS ──────────────────────────────────
const OperationSchema = z.object({
  name:      z.string().min(1).max(200),
  va:        z.number().min(0).default(0),
  nvan:      z.number().min(0).default(0),
  nva:       z.number().min(0).default(0),
  mcCT:      z.number().min(0).default(0),
  allowance: z.number().min(0).max(1).default(0.15),
})

const SectionSchema = z.object({
  name:         z.string().min(1).max(100),
  stdMP:        z.number().min(0).default(0),
  taktTime:     z.number().min(1, 'Takt time minimal 1 detik').default(36),
  hourlyTarget: z.number().int().min(0).max(10000).optional().nullable(),
  ops:          z.array(OperationSchema).default([]),
})

// ─── MODELS ─────────────────────────────────────────────────
export const ModelCreateSchema = z.object({
  name:         z.string().min(1).max(100),
  article:      z.string().max(100).optional().nullable(),
  stage:        z.string().max(100).optional().nullable(),
  lineType:     LineTypeSchema.optional(),
  uploadedFrom: z.string().max(200).optional().nullable(),
  dailyTarget:  z.number().int().min(0).max(100000).optional(),
  hourlyTarget: z.number().int().min(0).max(10000).optional(),
  sections:     z.array(SectionSchema).min(1, 'Minimal 1 section'),
})
export type ModelCreateInput = z.infer<typeof ModelCreateSchema>

export const ModelPatchSchema = z.object({
  name:         z.string().min(1).max(100).optional(),
  article:      z.string().max(100).optional().nullable(),
  stage:        z.string().max(100).optional().nullable(),
  lineType:     LineTypeSchema.optional(),
  dailyTarget:  z.number().int().min(0).max(100000).optional(),
  hourlyTarget: z.number().int().min(0).max(10000).optional(),
  sections:     z.array(SectionSchema).optional(),
})
export type ModelPatchInput = z.infer<typeof ModelPatchSchema>

// ─── LINE ASSIGNMENT ────────────────────────────────────────
export const LineAssignSchema = z.object({
  lineId:  cuid,
  modelId: cuid.nullable().optional(),
})
export type LineAssignInput = z.infer<typeof LineAssignSchema>

// ─── USERS ──────────────────────────────────────────────────
export const UserCreateSchema = z.object({
  name:     z.string().min(2).max(100),
  email:    z.string().email(),
  password: z.string().min(8, 'Password minimal 8 karakter').max(128),
  role:     RoleSchema,
  building: z.string().max(10).optional().nullable(),
  lineIds:  z.array(cuid).optional().default([]),
})
export type UserCreateInput = z.infer<typeof UserCreateSchema>

export const UserPatchSchema = z.object({
  id:       cuid,
  name:     z.string().min(2).max(100).optional(),
  role:     RoleSchema.optional(),
  building: z.string().max(10).nullable().optional(),
  active:   z.boolean().optional(),
  password: z.string().min(8).max(128).optional(),
  lineIds:  z.array(cuid).optional(),
})
export type UserPatchInput = z.infer<typeof UserPatchSchema>

// ─── DAILY TARGET ───────────────────────────────────────────
export const DailyTargetUpsertSchema = z.object({
  lineId:      cuid,
  targetPairs: positiveInt.max(100000),
  date:        dateString.optional(),
  note:        z.string().max(500).optional().nullable(),
})
export type DailyTargetUpsertInput = z.infer<typeof DailyTargetUpsertSchema>

// ─── ANALYTICS REQUEST ──────────────────────────────────────
export const AnalyticsRequestSchema = z.object({
  lineId:      cuid,
  sectionName: z.string().min(1).max(100),
})
export type AnalyticsRequestInput = z.infer<typeof AnalyticsRequestSchema>

// ─── SHIFT CLOSE ────────────────────────────────────────────
export const ShiftCloseSchema = z.object({
  lineId:       cuid,
  shiftLabel:   z.string().min(1).max(50),
  managerEmail: z.string().email(),
})
export type ShiftCloseInput = z.infer<typeof ShiftCloseSchema>
