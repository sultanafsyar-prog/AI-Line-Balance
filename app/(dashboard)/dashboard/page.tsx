import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { BUILDINGS, today, getGWT } from '@/lib/utils'
import { redirect } from 'next/navigation'
import DashboardClient from './client'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const user = session.user
  const userBuilding = user.building ?? null

  const lines = await prisma.line.findMany({
    where: userBuilding ? { building: userBuilding } : {},
    include: {
      assignments: {
        where: { active: true },
        include: {
          model: {
            include: {
              sections: {
                include: { operations: { orderBy: { seq: 'asc' } } },
              }
            }
          }
        },
        take: 1, orderBy: { assignedAt: 'desc' },
      },
      actuals: {
        where: { date: today() },
        include: { section: { select: { name: true, taktTime: true } } },
        orderBy: { hour: 'asc' },
      },
      alerts: { where: { resolved: false } },
      dailyTargets: { where: { date: today() }, take: 1 },
    },
    orderBy: [{ building: 'asc' }, { lineNo: 'asc' }],
  })

  const models = await prisma.shoeModel.count({ where: { active: true } })

  // Hitung theorMP per section (server-side)
  const serialized = lines.map(l => {
    const model = l.assignments[0]?.model ?? null

    // theorMP per section: sum(GWT semua ops) / taktTime
    const sectionTheoMP: Record<string, number> = {}
    if (model) {
      for (const sec of model.sections) {
        if (sec.taktTime <= 0) continue
        const totalGWT = sec.operations.reduce((s, op) => s + getGWT(op), 0)
        sectionTheoMP[sec.name] = parseFloat((totalGWT / sec.taktTime).toFixed(2))
      }
    }

    return {
      id: l.id,
      building: l.building,
      lineNo: l.lineNo,
      model: model ? { name: model.name, article: model.article, lineType: model.lineType, imageUrl: model.imageUrl } : null,
      sectionTheoMP,
      actuals: l.actuals.map(a => ({
        hour: a.hour, output: a.output, mpActual: a.mpActual,
        downtime: a.downtime, dtReason: a.dtReason, defect: a.defect,
        sectionName: a.section?.name ?? '', taktTime: a.section?.taktTime ?? 0,
      })),
      alerts: l.alerts.map(a => ({ type: a.type, message: a.message })),
      dailyTarget: l.dailyTargets?.[0]?.targetPairs ?? null,
    }
  })

  return (
    <DashboardClient
      lines={serialized}
      totalModels={models}
      userName={user.name ?? user.email ?? ''}
      userRole={user.role}
      userBuilding={userBuilding}
      buildings={BUILDINGS}
    />
  )
}
