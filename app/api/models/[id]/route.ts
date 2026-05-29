import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession, requireRole, parseBody } from '@/lib/api-helpers'
import { ModelPatchSchema } from '@/lib/validation'
import { saveSectionsPreservingActuals } from '@/lib/save-sections'

// GET /api/models/[id]
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (auth instanceof NextResponse) return auth

  try {
    const model = await prisma.shoeModel.findUnique({
      where: { id: params.id },
      include: {
        sections: {
          include: { operations: { orderBy: { seq: 'asc' } } },
          orderBy: { name: 'asc' }
        },
        assignments: { where: { active: true }, include: { line: true } }
      },
    })
    if (!model) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(model)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('GET /api/models/[id] error:', message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/models/[id] — update model
// PENTING: Tidak boleh deleteMany section, karena Section.id direferensi oleh Actual (FK).
// Pakai saveSectionsPreservingActuals yang upsert per section + replace operations.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(['IE_ADMIN', 'IE_OPERATOR'])
  if (auth instanceof NextResponse) return auth

  const parsed = await parseBody(req, ModelPatchSchema)
  if (parsed instanceof NextResponse) return parsed
  const { name, article, stage, lineType, sections } = parsed

  try {
    const existing = await prisma.shoeModel.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 })
    }

    // Update metadata — buang null supaya tidak menabrak field non-null di schema
    await prisma.shoeModel.update({
      where: { id: params.id },
      data: {
        ...(name     !== undefined          && { name }),
        ...(article  !== undefined && article  !== null && { article }),
        ...(stage    !== undefined && stage    !== null && { stage }),
        ...(lineType !== undefined          && { lineType }),
      },
    })

    // Rebuild sections jika dikirim, tanpa menghapus section lama
    if (sections && sections.length > 0) {
      await saveSectionsPreservingActuals(params.id, sections)
    }

    const updated = await prisma.shoeModel.findUnique({
      where: { id: params.id },
      include: {
        sections: {
          include: { operations: { orderBy: { seq: 'asc' } } },
          orderBy: { name: 'asc' }
        },
        assignments: { where: { active: true }, include: { line: true } }
      },
    })
    return NextResponse.json(updated)

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('PATCH /api/models/[id] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE /api/models/[id] — soft delete
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(['IE_ADMIN', 'IT_ADMIN'])
  if (auth instanceof NextResponse) return auth

  try {
    const existing = await prisma.shoeModel.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 })
    }

    await prisma.shoeModel.update({
      where: { id: params.id },
      data: { active: false }
    })
    return NextResponse.json({ success: true })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('DELETE /api/models/[id] error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
