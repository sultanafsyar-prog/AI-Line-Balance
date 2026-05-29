import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { today } from '@/lib/utils'
import { requireSession, requireRole, parseBody } from '@/lib/api-helpers'
import { LineAssignSchema } from '@/lib/validation'

// GET /api/lines?building=D
export async function GET(req: NextRequest) {
  const auth = await requireSession()
  if (auth instanceof NextResponse) return auth
  const session = auth

  const { searchParams } = new URL(req.url)
  const building = searchParams.get('building')

  // Build where clause sesuai role:
  // - Team Leader: hanya line yang di-assign ke user via UserLine
  // - Management dengan building scope: filter by building
  // - IE/IT Admin: bisa lihat semua, atau filter by building param
  let where: Record<string, unknown> = { active: true }

  if (session.user.role === 'TEAM_LEADER') {
    const lineIds = await prisma.userLine.findMany({
      where: { userId: session.user.id },
      select: { lineId: true },
    }).then(rows => rows.map(r => r.lineId))
    where = { ...where, id: { in: lineIds } }
  } else {
    const effectiveBuilding = session.user.building ?? building
    if (effectiveBuilding) {
      where = { ...where, building: effectiveBuilding }
    }
  }

  const lines = await prisma.line.findMany({
    where,
    include: {
      assignments: {
        where: { active: true },
        include: {
          model: {
            include: {
              sections: { include: { operations: { orderBy: { seq: 'asc' } } } }
            }
          }
        },
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

// POST /api/lines — assign model ke line
export async function POST(req: NextRequest) {
  const auth = await requireRole(['IE_ADMIN', 'IE_OPERATOR'])
  if (auth instanceof NextResponse) return auth

  const parsed = await parseBody(req, LineAssignSchema)
  if (parsed instanceof NextResponse) return parsed
  const { lineId, modelId } = parsed

  await prisma.lineAssignment.updateMany({
    where: { lineId, active: true },
    data: { active: false }
  })

  if (!modelId) return NextResponse.json({ message: 'Assignment removed' })

  const assignment = await prisma.lineAssignment.create({
    data: { lineId, modelId, assignedBy: auth.user.id },
    include: { model: true, line: true },
  })
  return NextResponse.json(assignment, { status: 201 })
}
