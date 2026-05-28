import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { today } from '@/lib/utils'

// GET /api/daily-target?lineId=xxx&date=2024-01-15
// GET /api/daily-target?date=2024-01-15  (semua line, untuk PPIC dashboard)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const lineId = searchParams.get('lineId')
  const date   = searchParams.get('date') ?? today()

  try {
    if (lineId) {
      // Target untuk 1 line spesifik
      const target = await (prisma as any).dailyTarget.findUnique({
        where: { lineId_date: { lineId, date } }
      })
      return NextResponse.json({ target: target ?? null })
    } else {
      // Semua target hari ini (untuk PPIC dashboard)
      const targets = await (prisma as any).dailyTarget.findMany({
        where: { date },
        include: {
          line: {
            select: { building: true, lineNo: true }
          }
        },
        orderBy: [{ line: { building: 'asc' } }, { line: { lineNo: 'asc' } }]
      })
      return NextResponse.json({ targets })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/daily-target
// Body: { lineId, targetPairs, date?, note? }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  // Hanya PPIC, IE Admin, dan Management yang bisa set target
  if (!['PPIC', 'IE_ADMIN', 'MANAGEMENT'].includes(user.role)) {
    return NextResponse.json(
      { error: 'Hanya PPIC yang bisa set target harian.' },
      { status: 403 }
    )
  }

  let body: { lineId: string; targetPairs: number; date?: string; note?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Request tidak valid.' }, { status: 400 }) }

  const { lineId, targetPairs, note } = body
  const date = body.date ?? today()

  if (!lineId || !targetPairs || targetPairs <= 0) {
    return NextResponse.json(
      { error: 'lineId dan targetPairs (> 0) wajib diisi.' },
      { status: 400 }
    )
  }

  try {
    const target = await (prisma as any).dailyTarget.upsert({
      where:  { lineId_date: { lineId, date } },
      update: { targetPairs, setBy: user.name ?? user.email, note: note ?? null },
      create: {
        lineId,
        date,
        targetPairs,
        setBy: user.name ?? user.email,
        note:  note ?? null,
      }
    })
    return NextResponse.json({ success: true, target })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/daily-target?lineId=xxx&date=2024-01-15
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (!['PPIC', 'IE_ADMIN', 'MANAGEMENT'].includes(user.role)) {
    return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const lineId = searchParams.get('lineId')
  const date   = searchParams.get('date') ?? today()

  if (!lineId) return NextResponse.json({ error: 'lineId wajib.' }, { status: 400 })

  try {
    await (prisma as any).dailyTarget.delete({
      where: { lineId_date: { lineId, date } }
    })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: false, error: 'Target tidak ditemukan.' }, { status: 404 })
  }
}