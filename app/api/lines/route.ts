import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { today } from '@/lib/utils'
import { revalidateTag } from 'next/cache'
import { requireSession, requireRole, parseBody, hasLineAccess } from '@/lib/api-helpers'
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
  const companyId = session.user.companyId
  let where: Record<string, unknown> = { active: true, companyId }

  if (session.user.role === 'TEAM_LEADER') {
    const lineIds = await prisma.userLine.findMany({
      where: { userId: session.user.id, companyId },
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
  const { lineId, modelId, mode } = parsed
  const companyId = auth.user.companyId
  if (!(await hasLineAccess(auth, lineId))) {
    return NextResponse.json({ error: 'Line tidak ditemukan' }, { status: 404 })
  }

  // Fase mixed-model: assignment aktif = daftar style yang boleh dijalankan
  // pada line ini. Actual tetap terikat ke style lewat sectionId.
  if (!modelId || mode === 'clear') {
    await prisma.lineAssignment.updateMany({
      where: { lineId, active: true, companyId },
      data: { active: false }
    })
    revalidateTag('sections-std') // TV std cache berisi assignments
    return NextResponse.json({ message: 'Assignment removed' })
  }

  if (mode === 'remove') {
    await prisma.lineAssignment.updateMany({
      where: { lineId, modelId, active: true, companyId },
      data: { active: false },
    })
    revalidateTag('sections-std')
    return NextResponse.json({ message: 'Assignment removed' })
  }

  const model = await prisma.shoeModel.findFirst({
    where: { id: modelId, companyId, active: true }, select: { id: true },
  })
  if (!model) return NextResponse.json({ error: 'Model tidak ditemukan' }, { status: 404 })

  const existing = await prisma.lineAssignment.findFirst({
    where: { lineId, modelId, active: true, companyId },
    include: { model: true, line: true },
  })
  if (existing) return NextResponse.json(existing)

  const assignment = await prisma.lineAssignment.create({
    data: { companyId, lineId, modelId, assignedBy: auth.user.id },
    include: { model: true, line: true },
  })
  revalidateTag('sections-std')
  return NextResponse.json(assignment, { status: 201 })
}
