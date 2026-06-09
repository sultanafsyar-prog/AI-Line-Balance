import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { today } from '@/lib/utils'
import { requireRole } from '@/lib/api-helpers'

type LineStatus = 'no_model' | 'no_input' | 'good' | 'warning' | 'critical'

type LineSummary = {
  id: string
  lineNo: number
  building: string
  model: { name: string; lineType: 'MINI' | 'BIG' } | null
  ller: number
  lastOutput: number
  tph: number
  todayOutput: number
  todayDowntime: number
  todayDefect: number
  hoursInput: number
  alerts: { type: string; message: string }[]
  status: LineStatus
}

type BuildingGroup = {
  building: string
  lines: LineSummary[]
  summary: {
    totalLines: number
    activeLines: number
    totalOutput: number
    avgLler: number
    totalAlerts: number
    criticalLines: number
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(['MANAGEMENT', 'IE_ADMIN', 'IE_OPERATOR', 'IT_ADMIN'])
  if (auth instanceof NextResponse) return auth
  const session = auth

  const userBuilding = session.user.building
  const { searchParams } = new URL(req.url)
  const filterBuilding = searchParams.get('building')

  const buildingFilter = userBuilding ?? filterBuilding ?? null

  const lines = await prisma.line.findMany({
    where: {
      active: true,
      ...(buildingFilter ? { building: buildingFilter } : {}),
    },
    include: {
      assignments: {
        where: { active: true }, take: 1,
        orderBy: { assignedAt: 'desc' },
        include: { model: { select: { name: true, lineType: true } } },
      },
      actuals: {
        where: { date: today() },
        include: { section: { select: { name: true, taktTime: true, stdMP: true, operations: { select: { va: true, nvan: true, nva: true, allowance: true } } } } },
        orderBy: { hour: 'desc' },
      },
      alerts: { where: { resolved: false } },
    },
    orderBy: [{ building: 'asc' }, { lineNo: 'asc' }],
  })

  const buildings: Record<string, BuildingGroup> = {}

  for (const line of lines) {
    const model = line.assignments[0]?.model ?? null
    const latestTakt = line.actuals[0]?.section?.taktTime ?? 0
    const tph   = latestTakt > 0 ? Math.round(3600 / latestTakt) : 0
    const actuals = line.actuals

    const totalOutput   = actuals.reduce((s, a) => s + a.output, 0)
    const totalDowntime = actuals.reduce((s, a) => s + a.downtime, 0)
    const totalDefect   = actuals.reduce((s, a) => s + a.defect, 0)
    const lastActual    = actuals[0] ?? null
    const lastOutput    = lastActual?.output ?? 0
    const avgMP = actuals.length > 0
      ? actuals.reduce((s, a) => s + a.mpActual, 0) / actuals.length : 0
    const avgOut = actuals.length > 0
      ? actuals.reduce((s, a) => s + a.output, 0) / actuals.length : 0

    // theoMP dari section terakhir
    const latestSec = lastActual?.section as any
    let theoMP = 0
    if (latestSec?.operations && latestSec.taktTime > 0) {
      const totalGWT = latestSec.operations.reduce((s: number, op: any) =>
        s + (op.va + op.nvan + op.nva) * (1 + (op.allowance ?? 0.15)), 0)
      theoMP = totalGWT / latestSec.taktTime
    }

    // LLER produktivitas gabungan
    const ller = (tph > 0 && avgOut > 0 && avgMP > 0 && theoMP > 0)
      ? Math.round((avgOut * avgMP) / (tph * theoMP) * 100) : 0

    let status: LineStatus
    if (!model)               status = 'no_model'
    else if (!lastActual)     status = 'no_input'
    else if (ller >= 90)      status = 'good'
    else if (ller >= 75)      status = 'warning'
    else                      status = 'critical'

    const lineData: LineSummary = {
      id: line.id, lineNo: line.lineNo, building: line.building,
      model: model ? { name: model.name, lineType: model.lineType } : null,
      ller, lastOutput, tph,
      todayOutput: totalOutput,
      todayDowntime: totalDowntime,
      todayDefect: totalDefect,
      hoursInput: actuals.length,
      alerts: line.alerts.map(a => ({ type: a.type, message: a.message })),
      status,
    }

    if (!buildings[line.building]) {
      buildings[line.building] = {
        building: line.building,
        lines: [],
        summary: { totalLines: 0, activeLines: 0, totalOutput: 0, avgLler: 0, totalAlerts: 0, criticalLines: 0 },
      }
    }
    buildings[line.building].lines.push(lineData)
  }

  for (const b of Object.values(buildings)) {
    const activeLines = b.lines.filter(l => l.hoursInput > 0)
    b.summary.totalLines    = b.lines.length
    b.summary.activeLines   = activeLines.length
    b.summary.totalOutput   = b.lines.reduce((s, l) => s + l.todayOutput, 0)
    b.summary.avgLler       = activeLines.length > 0
      ? Math.round(activeLines.reduce((s, l) => s + l.ller, 0) / activeLines.length)
      : 0
    b.summary.totalAlerts   = b.lines.reduce((s, l) => s + l.alerts.length, 0)
    b.summary.criticalLines = b.lines.filter(l => l.status === 'critical').length
  }

  const allActives = lines.filter(l => l.actuals.length > 0)
  const overall = {
    totalLines: lines.length,
    activeLines: allActives.length,
    totalOutput: lines.reduce((s, l) => s + l.actuals.reduce((a, b) => a + b.output, 0), 0),
    avgLler: allActives.length > 0
      ? Math.round(
          allActives.map(l => {
            // LLER produktivitas gabungan: Σ(avgOut × avgMP) / Σ(theoPPH × theoMP) × 100
            const acts = l.actuals
            let num = 0, den = 0
            const secBuckets = new Map<string, { mpSum: number; outSum: number; hours: number; theoMP: number; takt: number }>()
            for (const a of acts) {
              const sec = (a as any).section
              const secName = sec?.name ?? ''
              if (!secBuckets.has(secName)) {
                let tm = 0
                if (sec?.operations && sec.taktTime > 0) {
                  tm = sec.operations.reduce((s: number, op: any) =>
                    s + (op.va + op.nvan + op.nva) * (1 + (op.allowance ?? 0.15)), 0) / sec.taktTime
                }
                secBuckets.set(secName, { mpSum: 0, outSum: 0, hours: 0, theoMP: tm, takt: sec?.taktTime ?? 0 })
              }
              const b = secBuckets.get(secName)!
              b.mpSum += a.mpActual; b.outSum += a.output; b.hours += 1
            }
            for (const [, b] of secBuckets.entries()) {
              if (b.theoMP > 0 && b.hours > 0 && b.takt > 0) {
                const avgOut = b.outSum / b.hours
                const avgMP = b.mpSum / b.hours
                const theoPPH = 3600 / b.takt
                if (avgOut > 0 && avgMP > 0) { num += avgOut * avgMP; den += theoPPH * b.theoMP }
              }
            }
            return den > 0 ? (num / den) * 100 : 0
          }).reduce((a: number, b: number) => a + b, 0) / allActives.length,
        )
      : 0,
    totalAlerts: lines.reduce((s, l) => s + l.alerts.length, 0),
    criticalLines: Object.values(buildings).reduce((s, b) => s + b.summary.criticalLines, 0),
  }

  return NextResponse.json({
    overall,
    buildings: Object.values(buildings).sort((a, b) => a.building.localeCompare(b.building)),
    userBuilding,
  })
}