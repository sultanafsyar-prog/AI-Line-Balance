import { prisma } from '@/lib/db'

type OpInput = {
  name: string
  va?: number
  nvan?: number
  nva?: number
  mcCT?: number
  allowance?: number
}

type SectionInput = {
  name: string
  stdMP?: number
  taktTime?: number
  ops?: OpInput[]
}

/**
 * Save sections + operations for a model in a way that PRESERVES Actual history.
 *
 * Strategy:
 *  - For each incoming section: upsert by (modelId, name)
 *  - On existing section: update stdMP/taktTime, then DELETE operations and recreate
 *    (operations have no FK from Actual, safe to delete)
 *  - We do NOT delete sections themselves (Actual.sectionId FK protects them)
 *  - Sections that exist in DB but not in incoming list are LEFT ALONE
 *    (caller can soft-delete or rename if needed; we never destroy actuals)
 */
export async function saveSectionsPreservingActuals(
  modelId: string,
  newSections: SectionInput[],
): Promise<void> {
  for (const s of newSections) {
    const secName = String(s.name ?? '').trim()
    if (!secName) continue

    const existing = await prisma.section.findUnique({
      where: { modelId_name: { modelId, name: secName } },
    })

    let secId: string

    if (existing) {
      await prisma.section.update({
        where: { id: existing.id },
        data: {
          stdMP: s.stdMP ?? 0,
          taktTime: s.taktTime ?? 36,
        },
      })
      await prisma.operation.deleteMany({ where: { sectionId: existing.id } })
      secId = existing.id
    } else {
      const created = await prisma.section.create({
        data: {
          modelId,
          name: secName,
          stdMP: s.stdMP ?? 0,
          taktTime: s.taktTime ?? 36,
        },
      })
      secId = created.id
    }

    const ops = (s.ops ?? []).map((op, i) => ({
      sectionId: secId,
      seq:       i + 1,
      name:      String(op.name ?? '').slice(0, 200),
      va:        Number(op.va)        || 0,
      nvan:      Number(op.nvan)      || 0,
      nva:       Number(op.nva)       || 0,
      mcCT:      Number(op.mcCT)      || 0,
      allowance: Number(op.allowance) || 0.15,
    }))

    // Batch insert (Prisma createMany has size limits on some DBs)
    for (let i = 0; i < ops.length; i += 15) {
      await prisma.operation.createMany({ data: ops.slice(i, i + 15) })
    }
  }
}
