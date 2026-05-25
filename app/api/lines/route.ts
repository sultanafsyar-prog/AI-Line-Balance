import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isIE, today } from '@/lib/utils'

// GET /api/lines?building=D
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const building = searchParams.get('building')

  const lines = await prisma.line.findMany({
    where: { active: true, ...(building ? { building } : {}) },
    include: {
      assignments: {
        where: { active: true },
        include: { model: { include: { sections: { include: { operations: { orderBy: { seq: 'asc' } } } } } } },
        take: 1,
        orderBy: { assignedAt: 'desc' },
      },
      actuals: { where: { date: today() } },
      alerts: { where: { resolved: false } },
    },
    orderBy: [{ building: 'asc' }, { lineNo: 'asc' }],
  })
  return NextResponse.json(lines)
}

// POST /api/lines/assign
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !isIE((session.user as any)?.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { lineId, modelId } = await req.json()
  if (!lineId) return NextResponse.json({ error: 'lineId required' }, { status: 400 })

  // Nonaktifkan assignment lama
  await prisma.lineAssignment.updateMany({ where: { lineId, active: true }, data: { active: false } })

  if (!modelId) return NextResponse.json({ message: 'Assignment removed' })

  const assignment = await prisma.lineAssignment.create({
    data: { lineId, modelId, assignedBy: (session.user as any).id },
    include: { model: true, line: true },
  })
  return NextResponse.json(assignment, { status: 201 })
}
