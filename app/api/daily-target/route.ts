import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { today } from '@/lib/utils'
import { requireSession, requireRole, parseBody } from '@/lib/api-helpers'
import { DailyTargetUpsertSchema } from '@/lib/validation'

const TARGET_ROLES = ['PPIC', 'IE_ADMIN', 'MANAGEMENT'] as const

// GET /api/daily-target?lineId=xxx&date=2024-01-15
// GET /api/daily-target?date=2024-01-15  (semua line, untuk PPIC dashboard)
export async function GET(req: NextRequest) {
  const auth = await requireSession()
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const lineId = searchParams.get('lineId')
  const date   = searchParams.get('date') ?? today()

  if (lineId) {
    const target = await prisma.dailyTarget.findUnique({
      where: { lineId_date: { lineId, date } }
    })
    return NextResponse.json({ target: target ?? null })
  }

  const targets = await prisma.dailyTarget.findMany({
    where: { date },
    include: {
      line: { select: { building: true, lineNo: true } }
    },
    orderBy: [{ line: { building: 'asc' } }, { line: { lineNo: 'asc' } }]
  })
  return NextResponse.json({ targets })
}

// POST /api/daily-target
export async function POST(req: NextRequest) {
  const auth = await requireRole([...TARGET_ROLES])
  if (auth instanceof NextResponse) return auth

  const parsed = await parseBody(req, DailyTargetUpsertSchema)
  if (parsed instanceof NextResponse) return parsed
  const { lineId, targetPairs, note } = parsed
  const date = parsed.date ?? today()

  const setBy = auth.user.name ?? auth.user.email ?? auth.user.id

  const target = await prisma.dailyTarget.upsert({
    where:  { lineId_date: { lineId, date } },
    update: { targetPairs, setBy, note: note ?? null },
    create: { lineId, date, targetPairs, setBy, note: note ?? null },
  })
  return NextResponse.json({ success: true, target })
}

// DELETE /api/daily-target?lineId=xxx&date=2024-01-15
export async function DELETE(req: NextRequest) {
  const auth = await requireRole([...TARGET_ROLES])
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const lineId = searchParams.get('lineId')
  const date   = searchParams.get('date') ?? today()

  if (!lineId) return NextResponse.json({ error: 'lineId wajib.' }, { status: 400 })

  try {
    await prisma.dailyTarget.delete({
      where: { lineId_date: { lineId, date } }
    })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: false, error: 'Target tidak ditemukan.' }, { status: 404 })
  }
}
