import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession } from '@/lib/api-helpers'

// GET /api/shift-archive?building=D&days=30
// Riwayat shift yang sudah ditutup (dari tabel ShiftArchive).
// Scope per role: TEAM_LEADER → line miliknya; MANAGEMENT(building) → gedungnya.
export async function GET(req: NextRequest) {
  const auth = await requireSession()
  if (auth instanceof NextResponse) return auth
  const session = auth

  const { searchParams } = new URL(req.url)
  const buildingParam = searchParams.get('building')
  const daysParam = parseInt(searchParams.get('days') ?? '30', 10)
  const days = Math.min(Math.max(daysParam || 30, 1), 365)

  // Batas tanggal (string YYYY-MM-DD, konsisten dgn cara data disimpan)
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })

  // ── Tentukan line yang boleh dilihat user ──
  let allowedLineIds: string[] | null = null // null = semua
  if (session.user.role === 'TEAM_LEADER') {
    const access = await prisma.userLine.findMany({
      where: { userId: session.user.id },
      select: { lineId: true },
    })
    allowedLineIds = access.map(a => a.lineId)
    if (allowedLineIds.length === 0) return NextResponse.json({ archives: [] })
  } else {
    const effectiveBuilding =
      session.user.building ?? (buildingParam && buildingParam !== 'ALL' ? buildingParam : null)
    if (effectiveBuilding) {
      const lines = await prisma.line.findMany({
        where: { building: effectiveBuilding },
        select: { id: true },
      })
      allowedLineIds = lines.map(l => l.id)
      if (allowedLineIds.length === 0) return NextResponse.json({ archives: [] })
    }
  }

  const archives = await prisma.shiftArchive.findMany({
    where: {
      date: { gte: sinceStr },
      ...(allowedLineIds ? { lineId: { in: allowedLineIds } } : {}),
    },
    orderBy: [{ closedAt: 'desc' }],
    take: 500,
  })

  // ── Resolve lineId → building/lineNo dan closedBy → nama (tanpa relasi FK) ──
  const lineIds = [...new Set(archives.map(a => a.lineId))]
  const userIds = [...new Set(archives.map(a => a.closedBy))]
  const [lines, users] = await Promise.all([
    prisma.line.findMany({ where: { id: { in: lineIds } }, select: { id: true, building: true, lineNo: true } }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
  ])
  const lineMap = new Map(lines.map(l => [l.id, l]))
  const userMap = new Map(users.map(u => [u.id, u.name]))

  const result = archives.map(a => ({
    id: a.id,
    date: a.date,
    shiftLabel: a.shiftLabel,
    building: lineMap.get(a.lineId)?.building ?? '?',
    lineNo: lineMap.get(a.lineId)?.lineNo ?? 0,
    closedByName: userMap.get(a.closedBy) ?? '—',
    closedAt: a.closedAt.toISOString(),
    totalOutput: a.totalOutput,
    totalDT: a.totalDT,
    totalDefect: a.totalDefect,
    avgLler: a.avgLler,
    emailSent: a.emailSent,
  }))

  return NextResponse.json({ archives: result })
}
