import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const days    = parseInt(searchParams.get('days') ?? '7')
  const building = searchParams.get('building')
  const userBuilding = (session.user as any)?.building

  // Date range
  const endDate   = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days + 1)
  const dateList: string[] = []
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    dateList.push(d.toISOString().slice(0, 10))
  }

  const effectiveBuilding = userBuilding ?? (building !== 'ALL' ? building : null)

  // Ambil semua actuals dalam range
  const actuals = await prisma.actual.findMany({
    where: {
      date: { in: dateList },
      ...(effectiveBuilding ? { line: { building: effectiveBuilding } } : {}),
    },
    include: {
      line: {
        include: {
          assignments: {
            where: { active: true }, take: 1,
            include: { model: { select: { name: true, lineType: true } } },
          }
        }
      }
    }
  })

  // ─── PER DAY SUMMARY ────────────────────────────────────────
  const dayMap: Record<string, { outputs: number[]; downtime: number; defect: number; lines: Set<string> }> = {}
  dateList.forEach(d => { dayMap[d] = { outputs: [], downtime: 0, defect: 0, lines: new Set() } })

  actuals.forEach(a => {
    if (!dayMap[a.date]) return
    const model = a.line.assignments[0]?.model
    const tph = model?.lineType === 'BIG' ? 180 : 100
    const ller = tph > 0 ? a.output / tph * 100 : 0
    dayMap[a.date].outputs.push(ller)
    dayMap[a.date].downtime += a.downtime
    dayMap[a.date].defect   += a.defect
    dayMap[a.date].lines.add(a.lineId)
  })

  const daysSummary = dateList.map(date => {
    const d = dayMap[date]
    const avgLler = d.outputs.length > 0 ? Math.round(d.outputs.reduce((s, v) => s + v, 0) / d.outputs.length) : 0
    const totalOutput = actuals.filter(a => a.date === date).reduce((s, a) => s + a.output, 0)
    return {
      date: date.slice(5), // MM-DD
      avgLler,
      totalOutput,
      totalDowntime: d.downtime,
      totalDefect: d.defect,
      activeLines: d.lines.size,
    }
  })

  // ─── PER LINE PERFORMANCE ────────────────────────────────────
  const lineMap: Record<string, { building: string; lineNo: number; modelName: string; llers: number[]; output: number; hours: number }> = {}
  actuals.forEach(a => {
    const model = a.line.assignments[0]?.model
    const tph   = model?.lineType === 'BIG' ? 180 : 100
    const ller  = tph > 0 ? Math.round(a.output / tph * 100) : 0
    const key   = a.lineId
    if (!lineMap[key]) lineMap[key] = {
      building: a.line.building, lineNo: a.line.lineNo,
      modelName: model?.name ?? '—', llers: [], output: 0, hours: 0,
    }
    lineMap[key].llers.push(ller)
    lineMap[key].output += a.output
    lineMap[key].hours  += 1
  })

  const linePerf = Object.values(lineMap).map(l => ({
    building: l.building, lineNo: l.lineNo, modelName: l.modelName,
    avgLler: l.llers.length ? Math.round(l.llers.reduce((s, v) => s + v, 0) / l.llers.length) : 0,
    totalOutput: l.output, hours: l.hours,
  }))

  // ─── ALERT SUMMARY ───────────────────────────────────────────
  const alertCounts = await prisma.alert.groupBy({
    by: ['type'],
    _count: { id: true },
    where: {
      triggeredAt: { gte: startDate, lte: endDate },
      ...(effectiveBuilding ? { line: { building: effectiveBuilding } } : {}),
    },
  })
  const alertSummary = alertCounts.map(a => ({ type: a.type, count: a._count.id }))

  return NextResponse.json({ days: daysSummary, lines: linePerf, alerts: alertSummary })
}
