import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { today } from '@/lib/utils'
import { requireSession } from '@/lib/api-helpers'

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
  const auth = await requireSession()
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
        include: { section: { select: { name: true, taktTime: true } } },
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
    const tph   = latestTakt > 0 ? Math.floor(3600 / latestTakt) : 0
    const actuals = line.actuals

    const totalOutput   = actuals.reduce((s, a) => s + a.output, 0)
    const totalDowntime = actuals.reduce((s, a) => s + a.downtime, 0)
    const totalDefect   = actuals.reduce((s, a) => s + a.defect, 0)
    const lastActual    = actuals[0] ?? null
    const lastOutput    = lastActual?.output ?? 0
    const ller          = tph > 0 && lastOutput > 0 ? Math.round(lastOutput / tph * 100) : 0

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
            const takt = (l.actuals[0] as any)?.section?.taktTime ?? 0
            const tph = takt > 0 ? Math.floor(3600 / takt) : 0
            const last = l.actuals[0]?.output ?? 0
            return tph > 0 ? last / tph * 100 : 0
          }).reduce((a, b) => a + b, 0) / allActives.length,
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
