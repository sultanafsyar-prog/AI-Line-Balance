import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canInputActual, today } from '@/lib/utils'

// GET /api/actuals?lineId=X&date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const lineId = searchParams.get('lineId')
  const date = searchParams.get('date') ?? today()

  const actuals = await prisma.actual.findMany({
    where: { ...(lineId ? { lineId } : {}), date },
    include: { section: true },
    orderBy: [{ hour: 'asc' }],
  })
  return NextResponse.json(actuals)
}

// POST /api/actuals
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !canInputActual((session.user as any)?.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { lineId, sectionId, date, hour, output, mpActual, downtime, dtReason, defect, modelId } = body

  if (!lineId || !sectionId || !date || hour === undefined || output === undefined || mpActual === undefined)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  const actual = await prisma.actual.upsert({
    where: { lineId_sectionId_date_hour: { lineId, sectionId, date, hour } },
    update: { output, mpActual, downtime: downtime ?? 0, dtReason, defect: defect ?? 0 },
    create: {
      lineId, sectionId, date, hour, output, mpActual,
      downtime: downtime ?? 0, dtReason, defect: defect ?? 0,
      inputBy: (session.user as any).id,
    },
  })

  // ─── Auto-generate alerts ───────────────────────────────────
  const section = await prisma.section.findUnique({ where: { id: sectionId }, include: { model: true } })
  if (section) {
    const tph = section.model.lineType === 'BIG' ? 180 : 100
    if (output < tph * 0.8) {
      await prisma.alert.create({
        data: { lineId, type: 'OUTPUT_LOW', message: `Output ${output} pairs (${Math.round(output/tph*100)}% dari target ${tph})` }
      })
    }
    if (downtime > 15) {
      await prisma.alert.create({
        data: { lineId, type: 'DOWNTIME_HIGH', message: `Downtime ${downtime} menit${dtReason ? ` — ${dtReason}` : ''}` }
      })
    }
    if (output > 0 && defect / output > 0.02) {
      await prisma.alert.create({
        data: { lineId, type: 'DEFECT_HIGH', message: `Defect ${defect} pairs (${(defect/output*100).toFixed(1)}%)` }
      })
    }
  }

  return NextResponse.json(actual, { status: 201 })
}