import { NextResponse } from 'next/server'
import { getServerSession, type Session } from 'next-auth'
import { authOptions } from './auth'
import type { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from './db'

// ─── ERROR HELPERS ──────────────────────────────────────────
export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export function zodError(err: z.ZodError) {
  const message = err.issues
    .map(i => `${i.path.join('.') || 'field'}: ${i.message}`)
    .join('; ')
  return NextResponse.json({ error: message, issues: err.issues }, { status: 400 })
}

// ─── AUTH HELPERS ───────────────────────────────────────────
/**
 * Require a logged-in session. Returns Session if ok, NextResponse if not.
 * Caller pattern:
 *   const auth = await requireSession()
 *   if (auth instanceof NextResponse) return auth
 *   const session = auth
 */
export async function requireSession(): Promise<Session | NextResponse> {
  const session = await getServerSession(authOptions)
  if (!session?.user) return jsonError('Unauthorized', 401)
  return session
}

/**
 * Require a logged-in session AND that user.role is in `allowed`.
 */
export async function requireRole(
  allowed: Session['user']['role'][],
): Promise<Session | NextResponse> {
  const result = await requireSession()
  if (result instanceof NextResponse) return result
  if (!allowed.includes(result.user.role)) {
    return jsonError('Forbidden', 403)
  }
  return result
}

// ─── PARSE BODY WITH ZOD ────────────────────────────────────
export async function parseBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<z.infer<T> | NextResponse> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return jsonError('Request body bukan JSON yang valid')
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return zodError(parsed.error)
  return parsed.data
}

// ─── LINE ACCESS CHECK ──────────────────────────────────────
export async function getAccessibleLineWhere(
  session: Session,
  requestedBuilding?: string | null,
): Promise<Prisma.LineWhereInput> {
  if (session.user.role === 'TEAM_LEADER') {
    const rows = await prisma.userLine.findMany({
      where: { userId: session.user.id },
      select: { lineId: true },
    })
    return { id: { in: rows.map(row => row.lineId) } }
  }
  const building = session.user.building ??
    (requestedBuilding && requestedBuilding !== 'ALL' ? requestedBuilding : null)
  return building ? { building } : {}
}

/**
 * Cek apakah user punya akses ke line tertentu.
 * - IE_ADMIN / IE_OPERATOR / IT_ADMIN: akses semua
 * - TEAM_LEADER: hanya line di UserLine
 * - MANAGEMENT: hanya line di gedungnya (kalau building di-set)
 * - PPIC: akses semua
 */
export async function hasLineAccess(
  session: Session,
  lineId: string,
): Promise<boolean> {
  const role = session.user.role
  if (['IE_ADMIN', 'IE_OPERATOR', 'IT_ADMIN', 'PPIC'].includes(role)) {
    return true
  }
  if (role === 'TEAM_LEADER') {
    const access = await prisma.userLine.findUnique({
      where: { userId_lineId: { userId: session.user.id, lineId } },
    })
    return !!access
  }
  if (role === 'MANAGEMENT') {
    if (!session.user.building) return true // Manager global
    const line = await prisma.line.findUnique({
      where: { id: lineId },
      select: { building: true },
    })
    return line?.building === session.user.building
  }
  return false
}
