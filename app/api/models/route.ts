import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession, requireRole, parseBody } from '@/lib/api-helpers'
import { ModelCreateSchema } from '@/lib/validation'
import { saveSectionsPreservingActuals } from '@/lib/save-sections'

export async function GET() {
  const auth = await requireSession()
  if (auth instanceof NextResponse) return auth

  const models = await prisma.shoeModel.findMany({
    where: { active: true },
    include: {
      sections: {
        include: { operations: { orderBy: { seq: 'asc' } } },
        orderBy: { name: 'asc' }
      },
      assignments: { where: { active: true }, include: { line: true } },
    },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(models)
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(['IE_ADMIN', 'IE_OPERATOR'])
  if (auth instanceof NextResponse) return auth

  const parsed = await parseBody(req, ModelCreateSchema)
  if (parsed instanceof NextResponse) return parsed
  const { name, article, stage, lineType, uploadedFrom, sections } = parsed

  // Saring section yang punya ops (skema sudah validasi minimal 1 section,
  // tapi belum tentu semua section punya ops)
  const validSections = sections.filter(s => (s.ops ?? []).length > 0)
  if (validSections.length === 0) {
    return NextResponse.json(
      { error: 'Minimal 1 section harus punya operasi' },
      { status: 400 }
    )
  }

  try {
    const existing = await prisma.shoeModel.findUnique({ where: { name } })

    if (existing) {
      await prisma.shoeModel.update({
        where: { id: existing.id },
        data: {
          article:      article      ?? existing.article,
          stage:        stage        ?? existing.stage,
          lineType:     lineType     ?? existing.lineType,
          uploadedFrom: uploadedFrom ?? existing.uploadedFrom,
          active: true,
        }
      })
      await saveSectionsPreservingActuals(existing.id, validSections)

      const updated = await prisma.shoeModel.findUnique({
        where: { id: existing.id },
        include: { sections: { include: { operations: { orderBy: { seq: 'asc' } } } } }
      })
      return NextResponse.json(updated)
    }

    // Model baru
    const model = await prisma.shoeModel.create({
      data: {
        name,
        article:      article      ?? name,
        stage:        stage        ?? 'Production CFM',
        lineType:     lineType     ?? 'MINI',
        uploadedFrom: uploadedFrom ?? 'Upload',
        active: true,
      }
    })
    await saveSectionsPreservingActuals(model.id, validSections)

    const created = await prisma.shoeModel.findUnique({
      where: { id: model.id },
      include: { sections: { include: { operations: { orderBy: { seq: 'asc' } } } } }
    })
    return NextResponse.json(created, { status: 201 })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[POST /api/models]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
