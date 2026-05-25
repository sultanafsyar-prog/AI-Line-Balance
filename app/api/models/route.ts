import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isIE } from '@/lib/utils'

// GET /api/models
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const models = await prisma.shoeModel.findMany({
    where: { active: true },
    include: {
      sections: { include: { operations: { orderBy: { seq: 'asc' } } }, orderBy: { name: 'asc' } },
      assignments: { where: { active: true }, include: { line: true } },
    },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(models)
}

// POST /api/models — create model dari parsed NB Standard
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !isIE((session.user as any)?.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, article, stage, lineType, uploadedFrom, sections } = body

  if (!name || !sections) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  // Jika model sudah ada, update
  const existing = await prisma.shoeModel.findUnique({ where: { name } })
  if (existing) {
    // Hapus sections lama
    await prisma.section.deleteMany({ where: { modelId: existing.id } })
    const model = await prisma.shoeModel.update({
      where: { id: existing.id },
      data: {
        article, stage, lineType, uploadedFrom,
        sections: {
          create: sections.map((s: any) => ({
            name: s.name, stdMP: s.stdMP, taktTime: s.taktTime,
            operations: { create: s.ops.map((op: any, i: number) => ({
              seq: i + 1, name: op.name, va: op.va, nvan: op.nvan,
              nva: op.nva, mcCT: op.mcCT, allowance: op.allowance ?? 0.15,
            })) }
          }))
        }
      },
      include: { sections: { include: { operations: true } } }
    })
    return NextResponse.json(model)
  }

  const model = await prisma.shoeModel.create({
    data: {
      name, article, stage, lineType: lineType ?? 'MINI', uploadedFrom,
      sections: {
        create: sections.map((s: any) => ({
          name: s.name, stdMP: s.stdMP, taktTime: s.taktTime,
          operations: { create: s.ops.map((op: any, i: number) => ({
            seq: i + 1, name: op.name, va: op.va, nvan: op.nvan,
            nva: op.nva, mcCT: op.mcCT, allowance: op.allowance ?? 0.15,
          })) }
        }))
      }
    },
    include: { sections: { include: { operations: true } } }
  })
  return NextResponse.json(model, { status: 201 })
}
