import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { today } from '@/lib/utils'
import { requireSession } from '@/lib/api-helpers'

export async function GET() {
  const auth = await requireSession()
  if (auth instanceof NextResponse) return auth
  const session = auth

  // Same scope logic as /api/lines
  const where: Prisma.LineWhereInput = { active: true }

  if (session.user.role === 'TEAM_LEADER') {
    const access = await prisma.userLine.findMany({
      where: { userId: session.user.id },
      select: { lineId: true },
    })
    where.id = { in: access.map(a => a.lineId) }
  } else if (session.user.role === 'MANAGEMENT' && session.user.building) {
    where.building = session.user.building
  }

  const lines = await prisma.line.findMany({
    where,
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
      alerts: { where: { resolved: false, triggeredAt: { gte: new Date(today() + 'T00:00:00+07:00') } } },
    },
    orderBy: [{ building: 'asc' }, { lineNo: 'asc' }],
  })

  const result = lines.map(line => {
    const model = line.assignments[0]?.model ?? null
    const actuals = line.actuals
    const latestActual = actuals[0] ?? null
    // TPH dari taktTime section terakhir yang ada data
    const latestTakt = latestActual?.section?.taktTime ?? 0
    const tph = latestTakt > 0 ? Math.round(3600 / latestTakt) : 0

    const totalOutput   = actuals.reduce((s, a) => s + a.output, 0)
    const totalDowntime = actuals.reduce((s, a) => s + a.downtime, 0)
    const totalDefect   = actuals.reduce((s, a) => s + a.defect, 0)
    const avgMP = actuals.length > 0
      ? Math.round(actuals.reduce((s, a) => s + a.mpActual, 0) / actuals.length)
      : 0
    const avgOut = actuals.length > 0
      ? actuals.reduce((s, a) => s + a.output, 0) / actuals.length
      : 0

    // theoMP dari operations section terakhir
    const latestSec = latestActual?.section as any
    let theoMP = 0
    if (latestSec?.operations && latestSec.taktTime > 0) {
      const totalGWT = latestSec.operations.reduce((s: number, op: any) =>
        s + (op.va + op.nvan + op.nva) * (1 + (op.allowance ?? 0.15)), 0)
      theoMP = totalGWT / latestSec.taktTime
    }

    const latestOutput = latestActual?.output ?? 0
    // LLER produktivitas gabungan: (actualPPH × actualMP) / (theoPPH × theoMP) × 100
    const ller = (tph > 0 && avgOut > 0 && avgMP > 0 && theoMP > 0)
      ? Math.round((avgOut * avgMP) / (tph * theoMP) * 100) : 0
    const gap  = latestOutput - tph

    return {
      id: line.id,
      building: line.building,
      lineNo: line.lineNo,
      lineType: line.lineType,
      model,
      latestActual: latestActual ? {
        output: latestActual.output,
        mpActual: latestActual.mpActual,
        hour: latestActual.hour,
        section: latestActual.section?.name ?? '',
      } : null,
      todayTotals: {
        output: totalOutput, downtime: totalDowntime,
        defect: totalDefect, hours: new Set(actuals.map(a => a.hour)).size, avgMP,
      },
      alerts: line.alerts.map(a => ({ type: a.type, message: a.message })),
      ller, gap, targetPPH: tph,
    }
  })

  return NextResponse.json(result)
}