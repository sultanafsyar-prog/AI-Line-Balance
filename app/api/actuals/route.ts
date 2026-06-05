import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { today } from '@/lib/utils'
import { requireSession, requireRole, parseBody, hasLineAccess } from '@/lib/api-helpers'
import { ActualUpsertSchema } from '@/lib/validation'

// GET /api/actuals?lineId=X&date=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const auth = await requireSession()
  if (auth instanceof NextResponse) return auth
  const session = auth

  const { searchParams } = new URL(req.url)
  const lineId = searchParams.get('lineId')
  const date = searchParams.get('date') ?? today()

  // Team Leader: hanya line miliknya
  // Management dengan building scope: hanya line di gedungnya
  let lineFilter: Record<string, unknown> = {}
  if (session.user.role === 'TEAM_LEADER') {
    const accessibleLineIds = await prisma.userLine.findMany({
      where: { userId: session.user.id },
      select: { lineId: true },
    }).then(rows => rows.map(r => r.lineId))

    if (lineId && !accessibleLineIds.includes(lineId)) {
      return NextResponse.json([], { status: 200 }) // return empty array, bukan 403, supaya UI tidak error
    }
    lineFilter = lineId ? { lineId } : { lineId: { in: accessibleLineIds } }
  } else if (session.user.building && session.user.role === 'MANAGEMENT') {
    lineFilter = lineId
      ? { lineId, line: { building: session.user.building } }
      : { line: { building: session.user.building } }
  } else {
    lineFilter = lineId ? { lineId } : {}
  }

  const actuals = await prisma.actual.findMany({
    where: { ...lineFilter, date },
    include: { section: true },
    orderBy: [{ hour: 'asc' }],
  })
  return NextResponse.json(actuals)
}

// POST /api/actuals
export async function POST(req: NextRequest) {
  const auth = await requireRole(['IE_ADMIN', 'IE_OPERATOR', 'TEAM_LEADER'])
  if (auth instanceof NextResponse) return auth

  const parsed = await parseBody(req, ActualUpsertSchema)
  if (parsed instanceof NextResponse) return parsed
  const { lineId, sectionId, date, hour, output, mpActual, downtime, dtReason, defect } = parsed

  // Cek akses line sesuai role
  if (!(await hasLineAccess(auth, lineId))) {
    return NextResponse.json(
      { error: 'Anda tidak punya akses ke line ini' },
      { status: 403 }
    )
  }

  // Cek apakah shift sudah di-close untuk line+date ini — kalau iya, tolak semua edit/create
  const workDate = date ?? today()
  const closedRecord = await prisma.actual.findFirst({
    where: { lineId, date: workDate, shiftClosed: true },
    select: { id: true },
  })
  if (closedRecord) {
    return NextResponse.json(
      { error: 'Data ini sudah dikunci karena shift sudah ditutup. Hubungi IE Admin jika perlu koreksi.' },
      { status: 409 }
    )
  }

  const actual = await prisma.actual.upsert({
    where: { lineId_sectionId_date_hour: { lineId, sectionId, date: workDate, hour } },
    update: { output, mpActual, downtime, dtReason: dtReason ?? null, defect },
    create: {
      lineId, sectionId, date: workDate, hour, output, mpActual,
      downtime, dtReason: dtReason ?? null, defect,
      inputBy: auth.user.id,
    },
  })

  // ─── Auto-generate alerts (dedup: cek alert serupa yang masih aktif) ──
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    include: { model: true },
  })
  if (section) {
    const tph = section.taktTime > 0 ? Math.floor(3600 / section.taktTime) : 0
    const secName = section.name

    async function ensureAlert(type: 'OUTPUT_LOW' | 'DOWNTIME_HIGH' | 'DEFECT_HIGH', message: string) {
      // Dedup: cari alert aktif per line+type yang sudah mengandung section name
      const existing = await prisma.alert.findFirst({
        where: { lineId, type, resolved: false },
      })
      if (existing) {
        await prisma.alert.update({
          where: { id: existing.id },
          data: { message: `[${secName}] ${message}`, triggeredAt: new Date() },
        })
      } else {
        await prisma.alert.create({ data: { lineId, type, message: `[${secName}] ${message}` } })
      }
    }

    if (tph > 0 && output < tph * 0.8) {
      await ensureAlert(
        'OUTPUT_LOW',
        `Output ${output} pairs (${Math.round((output / tph) * 100)}% dari target ${tph})`
      )
    } else if (tph === 0 && output === 0) {
      await ensureAlert('OUTPUT_LOW', `Output 0 — tidak ada produksi`)
    }
    if (downtime > 15) {
      await ensureAlert(
        'DOWNTIME_HIGH',
        `Downtime ${downtime} menit${dtReason ? ` — ${dtReason}` : ''}`
      )
    }
    if (output > 0 && defect / output > 0.02) {
      await ensureAlert(
        'DEFECT_HIGH',
        `Defect ${defect} pairs (${((defect / output) * 100).toFixed(1)}%)`
      )
    }
  }

  return NextResponse.json(actual, { status: 201 })
}
