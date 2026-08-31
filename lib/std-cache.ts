import { unstable_cache } from 'next/cache'
import { prisma } from './db'

// ─── CACHE DATA STANDAR (hemat egress Supabase) ────────────────
// Data standar IE (section, takt, operasi → theoMP) JARANG berubah tapi
// sebelumnya ikut ditarik dari DB setiap poll TV/monitor (60 dtk, 24 jam)
// → egress 5GB/bulan jebol. Di-cache 10 menit + tag 'sections-std' yang
// di-revalidate saat model/section diubah, jadi data tetap benar.

export type SectionStd = {
  name: string
  taktTime: number
  stdMP: number
  hourlyTarget: number | null
  theoMP: number
}

// Map sectionId → data standar + theoMP (dihitung dari GWT operasi)
export const getSectionStdMap = unstable_cache(
  async (companyId: string): Promise<Record<string, SectionStd>> => {
    const sections = await prisma.section.findMany({
      where: { companyId },
      select: {
        id: true, name: true, taktTime: true, stdMP: true, hourlyTarget: true,
        operations: { select: { va: true, nvan: true, nva: true, allowance: true } },
      },
    })
    const map: Record<string, SectionStd> = {}
    for (const s of sections) {
      const gwt = s.operations.reduce(
        (sum, op) => sum + (op.va + op.nvan + op.nva) * (1 + (op.allowance ?? 0.15)), 0)
      map[s.id] = {
        name: s.name,
        taktTime: s.taktTime,
        stdMP: s.stdMP,
        hourlyTarget: s.hourlyTarget ?? null,
        theoMP: s.taktTime > 0 ? gwt / s.taktTime : 0,
      }
    }
    return map
  },
  ['section-std-map'],
  { revalidate: 600, tags: ['sections-std'] },
)

// Struktur line + model standar per gedung untuk TV (bagian BERAT dari
// query TV: assignments → model → sections → operations). Actuals/alerts/
// target harian TIDAK di sini — itu di-query fresh tiap refresh.
export const getTvStdLines = unstable_cache(
  async (companyId: string, building: string) =>
    prisma.line.findMany({
      where: { companyId, building },
      orderBy: { lineNo: 'asc' },
      include: {
        assignments: {
          where: { active: true }, orderBy: { assignedAt: 'desc' },
          include: {
            model: { include: { sections: { include: { operations: true } } } },
          },
        },
      },
    }),
  ['tv-std-lines'],
  { revalidate: 600, tags: ['sections-std'] },
)
