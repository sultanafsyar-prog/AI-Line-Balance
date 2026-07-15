import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireSession, hasLineAccess } from '@/lib/api-helpers'
import { calcLLER } from '@/lib/utils'
import { shiftNumberFromLabel } from '@/lib/shifts'

// GET /api/shift-archive/detail?lineId=xxx&date=YYYY-MM-DD
// Rincian per jam dari satu shift yang sudah ditutup.
export async function GET(req: NextRequest) {
  const auth = await requireSession()
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const lineId = searchParams.get('lineId')
  const date = searchParams.get('date')
  const shiftLabel = searchParams.get('shift')
  if (!lineId || !date) return NextResponse.json({ error: 'lineId & date wajib' }, { status: 400 })

  if (!(await hasLineAccess(auth, lineId))) {
    return NextResponse.json({ error: 'Tidak punya akses ke line ini' }, { status: 403 })
  }

  const actuals = await prisma.actual.findMany({
    where: {
      lineId,
      date,
      ...(shiftLabel
        ? { hour: shiftNumberFromLabel(shiftLabel) === 2 ? { gte: 20 } : { lt: 20 } }
        : {}),
    },
    include: {
      section: {
        select: {
          name: true, taktTime: true, stdMP: true, hourlyTarget: true,
          model: { select: { name: true } },
          operations: { select: { va: true, nvan: true, nva: true, allowance: true } },
        },
      },
    },
    orderBy: [{ hour: 'asc' }],
  })

  const rows = actuals.map(a => {
    const sec = a.section as any
    const takt = sec?.taktTime ?? 0
    const theoPPH = takt > 0 ? 3600 / takt : 0
    const target = sec?.hourlyTarget ?? (theoPPH > 0 ? Math.round(theoPPH) : 0)
    // theoMP dari GWT operations
    let theoMP = 0
    if (sec?.operations?.length && takt > 0) {
      const gwt = sec.operations.reduce((s: number, op: any) =>
        s + (op.va + op.nvan + op.nva) * (1 + (op.allowance ?? 0.15)), 0)
      theoMP = gwt / takt
    }
    const lller = calcLLER(a.output, a.mpActual, theoPPH, theoMP)
    return {
      hour: a.hour,
      model: sec?.model?.name ?? '—',
      section: sec?.name ?? '—',
      output: a.output,
      target,
      stdMP: sec?.stdMP ?? 0,
      theoMP: parseFloat(theoMP.toFixed(1)),
      mpActual: a.mpActual,
      lller,
      downtime: a.downtime,
      dtReason: a.dtReason ?? '',
      defect: a.defect,
    }
  })

  return NextResponse.json({ rows })
}
