import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isIE } from '@/lib/utils'

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

async function saveSections(modelId: string, sections: any[]) {
  for (const s of sections) {
    const sec = await prisma.section.create({
      data: { modelId, name: s.name, stdMP: s.stdMP ?? 0, taktTime: s.taktTime ?? 36 }
    })
    // Batch per 15 ops
    const ops = (s.ops ?? []).map((op: any, i: number) => ({
      sectionId: sec.id,
      seq: i + 1,
      name: String(op.name ?? '').slice(0, 200),
      va: Number(op.va) || 0,
      nvan: Number(op.nvan) || 0,
      nva: Number(op.nva) || 0,
      mcCT: Number(op.mcCT) || 0,
      allowance: Number(op.allowance) || 0.15,
    }))
    for (let i = 0; i < ops.length; i += 15) {
      await prisma.operation.createMany({ data: ops.slice(i, i + 15) })
    }
  }
}

async function deleteModelData(modelId: string) {
  // Hapus operations dulu (explicit, jangan andalkan cascade)
  const sections = await prisma.section.findMany({
    where: { modelId }, select: { id: true }
  })
  for (const sec of sections) {
    await prisma.operation.deleteMany({ where: { sectionId: sec.id } })
  }
  // Lalu hapus sections
  await prisma.section.deleteMany({ where: { modelId } })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !isIE((session.user as any)?.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json()
    const { name, article, stage, lineType, uploadedFrom, sections } = body
    if (!name || !sections?.length)
      return NextResponse.json({ error: 'Nama model dan sections wajib diisi' }, { status: 400 })

    const validSections = sections.filter((s: any) => s.ops?.length > 0)
    if (!validSections.length)
      return NextResponse.json({ error: 'Minimal 1 section harus punya operasi' }, { status: 400 })

    // Cek apakah sudah ada
    const existing = await prisma.shoeModel.findUnique({ where: { name } })

    if (existing) {
      // 1. Hapus data lama secara eksplisit
      await deleteModelData(existing.id)

      // 2. Update model info
      await prisma.shoeModel.update({
        where: { id: existing.id },
        data: {
          article: article ?? existing.article,
          stage: stage ?? existing.stage,
          lineType: lineType ?? existing.lineType,
          uploadedFrom: uploadedFrom ?? existing.uploadedFrom,
          active: true,
        }
      })

      // 3. Buat sections + operations baru
      await saveSections(existing.id, validSections)

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
        article: article ?? name,
        stage: stage ?? 'Production CFM',
        lineType: lineType ?? 'MINI',
        uploadedFrom: uploadedFrom ?? 'Upload',
        active: true,
      }
    })
    await saveSections(model.id, validSections)

    const created = await prisma.shoeModel.findUnique({
      where: { id: model.id },
      include: { sections: { include: { operations: { orderBy: { seq: 'asc' } } } } }
    })
    return NextResponse.json(created, { status: 201 })

  } catch (err: any) {
    console.error('[POST /api/models]', err?.message ?? err)
    return NextResponse.json(
      { error: err?.message ?? 'Gagal menyimpan model' },
      { status: 500 }
    )
  }
}