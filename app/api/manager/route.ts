import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { today } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  const userBuilding = user.building
  const { searchParams } = new URL(req.url)
  const filterBuilding = searchParams.get('building')

  // Effective building filter
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
        include: { section: { select: { name: true } } },
        orderBy: { hour: 'desc' },
      },
      alerts: { where: { resolved: false } },
    },
    orderBy: [{ building: 'asc' }, { lineNo: 'asc' }],
  })

  // Group by building
  const buildings: Record<string, any> = {}

  for (const line of lines) {
    const model  = line.assignments[0]?.model ?? null
    const tph    = model?.lineType === 'BIG' ? 180 : 100
    const actuals = line.actuals

    const totalOutput   = actuals.reduce((s, a) => s + a.output, 0)
    const totalDowntime = actuals.reduce((s, a) => s + a.downtime, 0)
    const totalDefect   = actuals.reduce((s, a) => s + a.defect, 0)
    const lastActual    = actuals[0] ?? null
    const lastOutput    = lastActual?.output ?? 0
    const ller          = tph > 0 && lastOutput > 0 ? Math.round(lastOutput / tph * 100) : 0

    const lineData = {
      id: line.id, lineNo: line.lineNo, building: line.building,
      model: model ? { name: model.name, lineType: model.lineType } : null,
      ller, lastOutput, tph,
      todayOutput: totalOutput,
      todayDowntime: totalDowntime,
      todayDefect: totalDefect,
      hoursInput: actuals.length,
      alerts: line.alerts.map(a => ({ type: a.type, message: a.message })),
      status: !model ? 'no_model' : !lastActual ? 'no_input' : ller >= 90 ? 'good' : ller >= 75 ? 'warning' : 'critical',
    }

    if (!buildings[line.building]) {
      buildings[line.building] = {
        building: line.building,
        lines: [],
        summary: { totalLines: 0, activeLines: 0, totalOutput: 0, avgLler: 0, totalAlerts: 0, criticalLines: 0 }
      }
    }
    buildings[line.building].lines.push(lineData)
  }

  // Calculate building summaries
  for (const b of Object.values(buildings) as any[]) {
    const activeLines = b.lines.filter((l: any) => l.hoursInput > 0)
    b.summary.totalLines   = b.lines.length
    b.summary.activeLines  = activeLines.length
    b.summary.totalOutput  = b.lines.reduce((s: number, l: any) => s + l.todayOutput, 0)
    b.summary.avgLler      = activeLines.length > 0
      ? Math.round(activeLines.reduce((s: number, l: any) => s + l.ller, 0) / activeLines.length)
      : 0
    b.summary.totalAlerts  = b.lines.reduce((s: number, l: any) => s + l.alerts.length, 0)
    b.summary.criticalLines = b.lines.filter((l: any) => l.status === 'critical').length
  }

  // Overall summary
  const allLines = lines
  const allActives = allLines.filter(l => l.actuals.length > 0)
  const overall = {
    totalLines: allLines.length,
    activeLines: allActives.length,
    totalOutput: allLines.reduce((s, l) => s + l.actuals.reduce((a, b) => a + b.output, 0), 0),
    avgLler: allActives.length > 0 ? Math.round(
      allActives.map(l => {
        const tph = l.assignments[0]?.model?.lineType === 'BIG' ? 180 : 100
        const last = l.actuals[0]?.output ?? 0
        return tph > 0 ? last / tph * 100 : 0
      }).reduce((a, b) => a + b, 0) / allActives.length
    ) : 0,
    totalAlerts: allLines.reduce((s, l) => s + l.alerts.length, 0),
    criticalLines: Object.values(buildings).reduce((s: number, b: any) => s + b.summary.criticalLines, 0),
  }

  return NextResponse.json({
    overall,
    buildings: Object.values(buildings).sort((a: any, b: any) => a.building.localeCompare(b.building)),
    userBuilding,
  })
}
