import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getAutoCloseShift, getShiftSlots } from '@/lib/shifts'

export const maxDuration = 60

type ActualWithSection = Prisma.ActualGetPayload<{ include: { section: { include: { operations: true } } } }>

function averageLler(actuals: ActualWithSection[]) {
  const groups = new Map<string, typeof actuals>()
  for (const actual of actuals) groups.set(actual.sectionId, [...(groups.get(actual.sectionId) ?? []), actual])
  const values = [...groups.values()].map(rows => {
    const section = rows[0].section
    const output = rows.reduce((sum, row) => sum + row.output, 0) / rows.length
    const mp = rows.reduce((sum, row) => sum + row.mpActual, 0) / rows.length
    const target = section.taktTime > 0 ? 3600 / section.taktTime : 0
    const gwt = section.operations.reduce((sum, operation) => sum +
      (operation.va + operation.nvan + operation.nva) * (1 + operation.allowance), 0)
    const theoreticalMp = section.taktTime > 0 ? gwt / section.taktTime : 0
    return target && mp && theoreticalMp ? (output * theoreticalMp) / (target * mp) * 100 : 0
  })
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const due = getAutoCloseShift()
  if (!due) return NextResponse.json({ closed: 0, message: 'Tidak ada shift yang jatuh tempo.' })
  const friday = new Date(`${due.date}T12:00:00+07:00`).getDay() === 5
  const slots = getShiftSlots(due.shift, { friday, overtimeHours: 3 })
  const lines = await prisma.line.findMany({
    where: { active: true, actuals: { some: { date: due.date, shiftClosed: false, hour: { in: slots } } } },
    select: { id: true, companyId: true },
  })
  let closed = 0
  for (const line of lines) {
    const actuals = await prisma.actual.findMany({
      where: { lineId: line.id, companyId: line.companyId, date: due.date, shiftClosed: false, hour: { in: slots } },
      include: { section: { include: { operations: true } } },
    })
    if (!actuals.length) continue
    try {
      await prisma.$transaction([
        prisma.shiftArchive.create({ data: {
          companyId: line.companyId, lineId: line.id, date: due.date, shift: due.shift,
          shiftLabel: `Shift ${due.shift}`, closedBy: 'system-auto-close',
          totalOutput: actuals.reduce((sum, row) => sum + row.output, 0),
          totalDT: actuals.reduce((sum, row) => sum + row.downtime, 0),
          totalDefect: actuals.reduce((sum, row) => sum + row.defect, 0),
          avgLler: averageLler(actuals), emailSent: false,
        } }),
        prisma.actual.updateMany({ where: { lineId: line.id, companyId: line.companyId, date: due.date, hour: { in: slots } }, data: { shiftClosed: true } }),
        prisma.alert.updateMany({ where: { lineId: line.id, companyId: line.companyId, resolved: false }, data: { resolved: true, resolvedAt: new Date() } }),
      ])
      closed++
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
    }
  }
  return NextResponse.json({ closed, shift: due.shift, date: due.date })
}
