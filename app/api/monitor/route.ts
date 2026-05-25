import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { today } from '@/lib/utils'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userBuilding = (session.user as any)?.building

  const lines = await prisma.line.findMany({
    where: { active: true, ...(userBuilding ? { building: userBuilding } : {}) },
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

  const result = lines.map(line => {
    const model = line.assignments[0]?.model ?? null
    const actuals = line.actuals
    const latestActual = actuals[0] ?? null
    const tph = model?.lineType === 'BIG' ? 180 : 100

    const totalOutput   = actuals.reduce((s, a) => s + a.output, 0)
    const totalDowntime = actuals.reduce((s, a) => s + a.downtime, 0)
    const totalDefect   = actuals.reduce((s, a) => s + a.defect, 0)
    const avgMP = actuals.length > 0
      ? Math.round(actuals.reduce((s, a) => s + a.mpActual, 0) / actuals.length)
      : 0

    const latestOutput = latestActual?.output ?? 0
    const ller = tph > 0 ? Math.round(latestOutput / tph * 100) : 0
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
        section: (latestActual as any).section?.name ?? '',
      } : null,
      todayTotals: { output: totalOutput, downtime: totalDowntime, defect: totalDefect, hours: actuals.length, avgMP },
      alerts: line.alerts.map(a => ({ type: a.type, message: a.message })),
      ller, gap, targetPPH: tph,
    }
  })

  return NextResponse.json(result)
}
