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

// Helper: validasi section structure
function validateSections(sections: any[]): boolean {
  if (!Array.isArray(sections) || sections.length === 0) return false
  return sections.every((s: any) =>
    s.name && typeof s.taktTime === 'number' && s.taktTime >= 5 &&
    Array.isArray(s.ops) && s.ops.every((op: any) =>
      op.name && typeof op.va === 'number'
    )
  )
}

// Helper: simpan sections + operations secara bertahap (hindari pooler timeout)
async function saveSections(modelId: string, sections: any[]) {
  for (const s of sections) {
    // Buat section
    const sec = await prisma.section.create({
      data: { 
        modelId, 
        name: s.name, 
        stdMP: s.stdMP ?? 0, 
        taktTime: s.taktTime ?? 36 
      }
    })
    // Buat operations dalam batch kecil (max 20 sekaligus)
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
    // Batch per 20
    for (let i = 0; i < ops.length; i += 20) {
      await prisma.operation.createMany({ data: ops.slice(i, i + 20) })
    }
  }
}

// POST /api/models — Create new or update existing model
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  // Check: user must be IE engineer to create/edit models
  if (!session || !isIE((session.user as any)?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { id, name, article, stage, lineType, uploadedFrom, sections } = body

    // Validate required fields
    if (!name || !sections) {
      return NextResponse.json({ error: 'Missing required fields: name, sections' }, { status: 400 })
    }

    if (!validateSections(sections)) {
      return NextResponse.json({ 
        error: 'Invalid sections: each section must have name, taktTime (≥5), and ops array with names' 
      }, { status: 400 })
    }

    // UPDATE existing model by ID
    if (id) {
      const existing = await prisma.shoeModel.findUnique({ where: { id } })
      if (!existing) {
        return NextResponse.json({ error: 'Model not found' }, { status: 404 })
      }

      // Delete old sections (cascade to operations)
      await prisma.section.deleteMany({ where: { modelId: id } })

      // Update model metadata
      await prisma.shoeModel.update({
        where: { id },
        data: { 
          name, 
          article, 
          stage, 
          lineType: lineType ?? 'MINI', 
          uploadedFrom, 
          active: true,
          updatedAt: new Date()
        }
      })

      // Save new sections
      await saveSections(id, sections)

      const updated = await prisma.shoeModel.findUnique({
        where: { id },
        include: { 
          sections: { 
            include: { operations: { orderBy: { seq: 'asc' } } },
            orderBy: { name: 'asc' }
          },
          assignments: { where: { active: true }, include: { line: true } }
        }
      })
      return NextResponse.json(updated)
    }

    // CREATE new model
    // Check if model with same name already exists
    const byName = await prisma.shoeModel.findUnique({ where: { name } })
    if (byName) {
      return NextResponse.json({ 
        error: `Model "${name}" already exists. Use PATCH with ID to update.` 
      }, { status: 409 })
    }

    const model = await prisma.shoeModel.create({
      data: {
        name,
        article: article ?? `U-${name}`,
        stage: stage ?? 'Production CFM',
        lineType: lineType ?? 'MINI',
        uploadedFrom: uploadedFrom ?? 'Manual',
        active: true
      }
    })

    await saveSections(model.id, sections)

    const created = await prisma.shoeModel.findUnique({
      where: { id: model.id },
      include: { 
        sections: { 
          include: { operations: { orderBy: { seq: 'asc' } } },
          orderBy: { name: 'asc' }
        },
        assignments: { where: { active: true }, include: { line: true } }
      }
    })
    return NextResponse.json(created, { status: 201 })

  } catch (error: any) {
    console.error('POST /api/models error:', error)
    return NextResponse.json({ 
      error: error.message ?? 'Internal server error' 
    }, { status: 500 })
  }
}