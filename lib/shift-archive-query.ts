import { prisma } from '@/lib/db'
import type { Session } from 'next-auth'

export type ShiftArchiveRow = {
  id: string
  lineId: string
  date: string
  shiftLabel: string
  building: string
  lineNo: number
  sections: string[]
  target: number | null
  achievement: number | null
  closedByName: string
  closedAt: string
  totalOutput: number
  totalDT: number
  totalDefect: number
  avgLler: number
  emailSent: boolean
}

// Ambil + perkaya riwayat shift, ber-scope sesuai role.
// Dipakai oleh /api/shift-archive (JSON) dan /api/export/shift-history (Excel).
export async function getShiftArchives(
  session: Session,
  opts: { building?: string | null; days?: number },
): Promise<ShiftArchiveRow[]> {
  const days = Math.min(Math.max(opts.days || 30, 1), 365)
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })

  // Scope line per role
  let allowedLineIds: string[] | null = null
  if (session.user.role === 'TEAM_LEADER') {
    const access = await prisma.userLine.findMany({
      where: { userId: session.user.id }, select: { lineId: true },
    })
    allowedLineIds = access.map(a => a.lineId)
    if (allowedLineIds.length === 0) return []
  } else {
    const effectiveBuilding =
      session.user.building ?? (opts.building && opts.building !== 'ALL' ? opts.building : null)
    if (effectiveBuilding) {
      const lines = await prisma.line.findMany({ where: { building: effectiveBuilding }, select: { id: true } })
      allowedLineIds = lines.map(l => l.id)
      if (allowedLineIds.length === 0) return []
    }
  }

  const archives = await prisma.shiftArchive.findMany({
    where: {
      date: { gte: sinceStr },
      ...(allowedLineIds ? { lineId: { in: allowedLineIds } } : {}),
    },
    orderBy: [{ closedAt: 'desc' }],
    take: 1000,
  })
  if (archives.length === 0) return []

  const lineIds = [...new Set(archives.map(a => a.lineId))]
  const userIds = [...new Set(archives.map(a => a.closedBy))]
  const dates   = [...new Set(archives.map(a => a.date))]

  const [lines, users, dailyTargets, actualSecs] = await Promise.all([
    prisma.line.findMany({ where: { id: { in: lineIds } }, select: { id: true, building: true, lineNo: true } }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
    prisma.dailyTarget.findMany({
      where: { lineId: { in: lineIds }, date: { in: dates } },
      select: { lineId: true, date: true, targetPairs: true },
    }),
    prisma.actual.findMany({
      where: { lineId: { in: lineIds }, date: { in: dates } },
      select: { lineId: true, date: true, section: { select: { name: true } } },
    }),
  ])
  const lineMap = new Map(lines.map(l => [l.id, l]))
  const userMap = new Map(users.map(u => [u.id, u.name]))
  const targetMap = new Map(dailyTargets.map(d => [`${d.lineId}|${d.date}`, d.targetPairs]))
  const secMap = new Map<string, Set<string>>()
  for (const a of actualSecs) {
    const k = `${a.lineId}|${a.date}`
    if (!secMap.has(k)) secMap.set(k, new Set())
    if (a.section?.name) secMap.get(k)!.add(a.section.name)
  }

  return archives.map(a => {
    const k = `${a.lineId}|${a.date}`
    const target = targetMap.get(k) ?? null
    return {
      id: a.id,
      lineId: a.lineId,
      date: a.date,
      shiftLabel: a.shiftLabel,
      building: lineMap.get(a.lineId)?.building ?? '?',
      lineNo: lineMap.get(a.lineId)?.lineNo ?? 0,
      sections: [...(secMap.get(k) ?? [])],
      target,
      achievement: target && target > 0 ? Math.round((a.totalOutput / target) * 100) : null,
      closedByName: userMap.get(a.closedBy) ?? '—',
      closedAt: a.closedAt.toISOString(),
      totalOutput: a.totalOutput,
      totalDT: a.totalDT,
      totalDefect: a.totalDefect,
      avgLler: a.avgLler,
      emailSent: a.emailSent,
    }
  })
}
