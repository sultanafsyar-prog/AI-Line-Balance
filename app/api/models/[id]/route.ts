import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isIE } from '@/lib/utils'

// Helper: validasi section structure
function validateSections(sections: any[]): boolean {
  if (!Array.isArray(sections) || sections.length === 0) return false
  return sections.every(s =>
    s.name && typeof s.taktTime === 'number' && s.taktTime >= 5 &&
    Array.isArray(s.ops) && s.ops.every(op =>
      op.name && typeof op.va === 'number'
    )
  )
}

// Helper: simpan sections + operations dengan batching
async function saveSections(modelId: string, sections: any[]) {
  for (const s of sections) {
    const sec = await prisma.section.create({
      data: { 
        modelId, 
        name: s.name, 
        stdMP: s.stdMP ?? 0, 
        taktTime: s.taktTime ?? 36 
      }
    })
    const ops = s.ops.map((op: any, i: number) => ({
      sectionId: sec.id,
      seq: i + 1, 
      name: op.name || 'Unnamed', 
      va: op.va ?? 0, 
      nvan: op.nvan ?? 0,
      nva: op.nva ?? 0, 
      mcCT: op.mcCT ?? 0,
      allowance: op.allowance ?? 0.15,
    }))
    for (let i = 0; i < ops.length; i += 20) {
      await prisma.operation.createMany({ data: ops.slice(i, i + 20) })
    }
  }
}

// GET /api/models/[id]
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  } catch (error: any) {
    console.error('GET /api/models/[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH /api/models/[id] — update model
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || !isIE((session.user as any)?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { name, article, stage, lineType, sections } = body

    // Check if model exists
    const existing = await prisma.shoeModel.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 })
    }

    // Update model metadata
    await prisma.shoeModel.update({
      where: { id: params.id },
      data: { 
        ...(name && { name }),
        ...(article && { article }),
        ...(stage && { stage }),
        ...(lineType && { lineType }),
        updatedAt: new Date()
      },
    })

    // Rebuild sections if provided
    if (sections) {
      if (!validateSections(sections)) {
        return NextResponse.json({ 
          error: 'Invalid sections: each section must have name, taktTime (≥5), and ops array with names' 
        }, { status: 400 })
      }

      // Delete old sections and operations (cascade)
      await prisma.section.deleteMany({ where: { modelId: params.id } })

      // Save new sections
      await saveSections(params.id, sections)
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

  } catch (error: any) {
    console.error('PATCH /api/models/[id] error:', error)
    return NextResponse.json({ 
      error: error.message ?? 'Internal server error' 
    }, { status: 500 })
  }
}

// DELETE /api/models/[id] — soft delete
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session || !isIE((session.user as any)?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const existing = await prisma.shoeModel.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ error: 'Model not found' }, { status: 404 })
    }

    await prisma.shoeModel.update({ 
      where: { id: params.id }, 
      data: { active: false, updatedAt: new Date() } 
    })
    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('DELETE /api/models/[id] error:', error)
    return NextResponse.json({ 
      error: error.message ?? 'Internal server error' 
    }, { status: 500 })
  }
}
