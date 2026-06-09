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
      section: { select: { name: true, taktTime: true, operations: { select: { va: true, nvan: true, nva: true, allowance: true } } } },
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

  // ── Pre-compute theoMP per sectionId ──
  const theoMPCache = new Map<string, number>()
  for (const a of actuals) {
    if (theoMPCache.has(a.sectionId)) continue
    const sec = a.section as any
    if (!sec?.operations?.length || sec.taktTime <= 0) { theoMPCache.set(a.sectionId, 0); continue }
    const totalGWT = sec.operations.reduce((s: number, op: any) =>
      s + (op.va + op.nvan + op.nva) * (1 + (op.allowance ?? 0.15)), 0)
    theoMPCache.set(a.sectionId, totalGWT / sec.taktTime)
  }

  // ─── PER DAY SUMMARY ────────────────────────────────────────
  // LLER produktivitas gabungan: (avgOut × avgMP) / (theoPPH × theoMP) × 100
  type DayBucket = { num: number; den: number; downtime: number; defect: number; lines: Set<string>; count: number }
  const dayMap: Record<string, DayBucket> = {}
  dateList.forEach(d => { dayMap[d] = { num: 0, den: 0, downtime: 0, defect: 0, lines: new Set(), count: 0 } })

  actuals.forEach(a => {
    const bucket = dayMap[a.date]
    if (!bucket) return
    const secTakt = a.section?.taktTime ?? 0
    const theoPPH = secTakt > 0 ? 3600 / secTakt : 0
    const theoMP = theoMPCache.get(a.sectionId) ?? 0
    if (theoPPH > 0 && theoMP > 0 && a.mpActual > 0 && a.output > 0) {
      bucket.num += a.output * a.mpActual
      bucket.den += theoPPH * theoMP
    }
    bucket.downtime += a.downtime
    bucket.defect   += a.defect
    bucket.lines.add(a.lineId)
    bucket.count += 1
  })

  const daysSummary = dateList.map(date => {
    const d = dayMap[date]
    const avgLler = d.den > 0 ? Math.round((d.num / d.den) * 100) : 0
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
  // LLER produktivitas gabungan per line: Σ(output×mp) / Σ(theoPPH×theoMP) × 100
  type LineBucket = {
    building: string; lineNo: number; modelName: string
    num: number; den: number; output: number; hours: number
  }
  const lineMap: Record<string, LineBucket> = {}
  actuals.forEach(a => {
    const secTakt2 = a.section?.taktTime ?? 0
    const theoPPH = secTakt2 > 0 ? 3600 / secTakt2 : 0
    const theoMP = theoMPCache.get(a.sectionId) ?? 0
    const model = a.line.assignments[0]?.model
    const key   = a.lineId
    if (!lineMap[key]) {
      lineMap[key] = {
        building: a.line.building, lineNo: a.line.lineNo,
        modelName: model?.name ?? '—', num: 0, den: 0, output: 0, hours: 0,
      }
    }
    if (theoPPH > 0 && theoMP > 0 && a.mpActual > 0 && a.output > 0) {
      lineMap[key].num += a.output * a.mpActual
      lineMap[key].den += theoPPH * theoMP
    }
    lineMap[key].output += a.output
    lineMap[key].hours  += 1
  })

  const linePerf = Object.values(lineMap).map(l => ({
    building: l.building, lineNo: l.lineNo, modelName: l.modelName,
    avgLler: l.den > 0 ? Math.round((l.num / l.den) * 100) : 0,
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
