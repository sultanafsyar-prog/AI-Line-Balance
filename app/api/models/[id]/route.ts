import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isIE } from '@/lib/utils'

// GET /api/models/[id]
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const model = await prisma.shoeModel.findUnique({
    where: { id: params.id },
    include: { sections: { include: { operations: { orderBy: { seq: 'asc' } } }, orderBy: { name: 'asc' } } },
  })
  if (!model) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(model)
}

// PATCH /api/models/[id] — update model
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || !isIE((session.user as any)?.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, article, stage, lineType, sections } = body

  // Update model info
  await prisma.shoeModel.update({
    where: { id: params.id },
    data: { name, article, stage, lineType },
  })

  // Rebuild sections if provided
  if (sections) {
    await prisma.section.deleteMany({ where: { modelId: params.id } })
    await prisma.section.createMany({
      data: sections.map((s: any) => ({
        id: require('crypto').randomUUID(),
        modelId: params.id,
        name: s.name, stdMP: s.stdMP, taktTime: s.taktTime,
      }))
    })
    // Re-fetch section IDs then create operations
    const createdSecs = await prisma.section.findMany({ where: { modelId: params.id } })
    for (const sec of sections) {
      const dbSec = createdSecs.find(s => s.name === sec.name)
      if (!dbSec) continue
      await prisma.operation.createMany({
        data: sec.ops.map((op: any, i: number) => ({
          sectionId: dbSec.id,
          seq: i + 1, name: op.name,
          va: op.va, nvan: op.nvan, nva: op.nva,
          mcCT: op.mcCT, allowance: op.allowance <= 1 ? op.allowance : op.allowance / 100,
        }))
      })
    }
  }

  const updated = await prisma.shoeModel.findUnique({
    where: { id: params.id },
    include: { sections: { include: { operations: { orderBy: { seq: 'asc' } } } } },
  })
  return NextResponse.json(updated)
}

// DELETE /api/models/[id] — soft delete
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || !isIE((session.user as any)?.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await prisma.shoeModel.update({ where: { id: params.id }, data: { active: false } })
  return NextResponse.json({ success: true })
}
