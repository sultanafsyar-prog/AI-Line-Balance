import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const auth = await requireSession()
  if (auth instanceof NextResponse) return auth
  const session = auth

  const { searchParams } = new URL(req.url)
  const daysParam = parseInt(searchParams.get('days') ?? '7', 10)
  const days = Math.min(Math.max(daysParam || 7, 1), 90) // clamp 1..90
  const buildingParam = searchParams.get('building')
  const userBuilding = session.user.building

  // Date range — use Asia/Jakarta timezone consistent with today()
  const dateList: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    dateList.push(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }))
  }

  const effectiveBuilding =
    userBuilding ?? (buildingParam && buildingParam !== 'ALL' ? buildingParam : null)

  const actuals = await prisma.actual.findMany({
    where: {
      date: { in: dateList },
      ...(effectiveBuilding ? { line: { building: effectiveBuilding } } : {}),
    },
    include: {
      section: { select: { taktTime: true } },
      line: {
        include: {
          assignments: {
            where: { active: true }, take: 1,
            include: { model: { select: { name: true, lineType: true } } },
          },
        },
      },
    },
  })

  // ─── PER DAY SUMMARY ────────────────────────────────────────
  type DayBucket = { outputs: number[]; downtime: number; defect: number; lines: Set<string> }
  const dayMap: Record<string, DayBucket> = {}
  dateList.forEach(d => { dayMap[d] = { outputs: [], downtime: 0, defect: 0, lines: new Set() } })

  actuals.forEach(a => {
    const bucket = dayMap[a.date]
    if (!bucket) return
    const secTakt = a.section?.taktTime ?? 0
    const tph = secTakt > 0 ? Math.floor(3600 / secTakt) : 0
    const ller = tph > 0 ? a.output / tph * 100 : 0
    bucket.outputs.push(ller)
    bucket.downtime += a.downtime
    bucket.defect   += a.defect
    bucket.lines.add(a.lineId)
  })

  const daysSummary = dateList.map(date => {
    const d = dayMap[date]
    const avgLler = d.outputs.length > 0
      ? Math.round(d.outputs.reduce((s, v) => s + v, 0) / d.outputs.length)
      : 0
    const totalOutput = actuals
      .filter(a => a.date === date)
      .reduce((s, a) => s + a.output, 0)
    return {
      date: date.slice(5),
      avgLler,
      totalOutput,
      totalDowntime: d.downtime,
      totalDefect: d.defect,
      activeLines: d.lines.size,
    }
  })

  // ─── PER LINE PERFORMANCE ────────────────────────────────────
  type LineBucket = {
    building: string; lineNo: number; modelName: string
    llers: number[]; output: number; hours: number
  }
  const lineMap: Record<string, LineBucket> = {}
  actuals.forEach(a => {
    const secTakt2 = a.section?.taktTime ?? 0
    const tph   = secTakt2 > 0 ? Math.floor(3600 / secTakt2) : 0
    const ller  = tph > 0 ? Math.round(a.output / tph * 100) : 0
    const model = a.line.assignments[0]?.model
    const key   = a.lineId
    if (!lineMap[key]) {
      lineMap[key] = {
        building: a.line.building, lineNo: a.line.lineNo,
        modelName: model?.name ?? '—', llers: [], output: 0, hours: 0,
      }
    }
    lineMap[key].llers.push(ller)
    lineMap[key].output += a.output
    lineMap[key].hours  += 1
  })

  const linePerf = Object.values(lineMap).map(l => ({
    building: l.building, lineNo: l.lineNo, modelName: l.modelName,
    avgLler: l.llers.length
      ? Math.round(l.llers.reduce((s, v) => s + v, 0) / l.llers.length)
      : 0,
    totalOutput: l.output, hours: l.hours,
  }))

  // ─── ALERT SUMMARY ───────────────────────────────────────────
  const alertCounts = await prisma.alert.groupBy({
    by: ['type'],
    _count: { id: true },
    where: {
      triggeredAt: {
        gte: new Date(dateList[0] + 'T00:00:00+07:00'),
        lte: new Date(dateList[dateList.length - 1] + 'T23:59:59+07:00'),
      },
      ...(effectiveBuilding ? { line: { building: effectiveBuilding } } : {}),
    },
  })
  const alertSummary = alertCounts.map(a => ({ type: a.type, count: a._count.id }))

  return NextResponse.json({ days: daysSummary, lines: linePerf, alerts: alertSummary })
}
