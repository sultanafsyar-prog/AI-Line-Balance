import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import * as XLSX from 'xlsx'
import { today } from '@/lib/utils'
import { jsonError, requireSession } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const auth = await requireSession()
  if (auth instanceof NextResponse) return auth
  const session = auth

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') ?? today()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonError('Format tanggal harus YYYY-MM-DD')
  }
  const userBuilding = session.user.building

  // Ambil semua data
  const lines = await prisma.line.findMany({
    where: { active: true, ...(userBuilding ? { building: userBuilding } : {}) },
    include: {
      assignments: {
        where: { active: true }, take: 1,
        include: { model: { select: { name: true, lineType: true } } },
      },
      actuals: {
        where: { date },
        include: { section: { select: { name: true, taktTime: true, operations: { select: { va: true, nvan: true, nva: true, allowance: true } } } } },
        orderBy: [{ section: { name: 'asc' } }, { hour: 'asc' }],
      },
    },
    orderBy: [{ building: 'asc' }, { lineNo: 'asc' }],
  })

  const wb = XLSX.utils.book_new()

  // ─── SHEET 1: SUMMARY SEMUA LINE ─────────────────────────
  const summaryHeader = [
    'Gedung', 'Line', 'Model', 'Tipe', 'Target PPH',
    'Total Output', 'Avg MP', 'Total DT (mnt)', 'Total Defect',
    'LLER (%)', 'Jam Input', 'Status',
  ]
  const summaryRows = lines.map(line => {
    const model = line.assignments[0]?.model
    const actuals = line.actuals
    const totalOut = actuals.reduce((s, a) => s + a.output, 0)
    const totalDT  = actuals.reduce((s, a) => s + a.downtime, 0)
    const totalDef = actuals.reduce((s, a) => s + a.defect, 0)
    const avgMP = actuals.length ? Math.round(actuals.reduce((s, a) => s + a.mpActual, 0) / actuals.length) : 0
    // TPH dari section pertama (untuk display)
    const firstTakt = actuals[0]?.section?.taktTime ?? 0
    const tph = firstTakt > 0 ? Math.round(3600 / firstTakt) : 0
    // LLER produktivitas gabungan: Σ(avgOut × avgMP) / Σ(theoPPH × theoMP) × 100
    // Agregat semua section, bukan hanya section pertama
    let llerNum = 0, llerDen = 0
    const secBuckets = new Map<string, { mpSum: number; outSum: number; hours: number; theoMP: number; takt: number }>()
    for (const a of actuals) {
      const sec = a.section as any
      const secName = sec?.name ?? ''
      if (!secBuckets.has(secName)) {
        let tm = 0
        if (sec?.operations && sec.taktTime > 0) {
          tm = sec.operations.reduce((s: number, op: any) =>
            s + (op.va + op.nvan + op.nva) * (1 + (op.allowance ?? 0.15)), 0) / sec.taktTime
        }
        secBuckets.set(secName, { mpSum: 0, outSum: 0, hours: 0, theoMP: tm, takt: sec?.taktTime ?? 0 })
      }
      const b = secBuckets.get(secName)!
      b.mpSum += a.mpActual; b.outSum += a.output; b.hours += 1
    }
    for (const [, b] of secBuckets.entries()) {
      if (b.theoMP > 0 && b.hours > 0 && b.takt > 0) {
        const avgO = b.outSum / b.hours
        const avgM = b.mpSum / b.hours
        const theoPPH = 3600 / b.takt
        if (avgO > 0 && avgM > 0) { llerNum += avgO * avgM; llerDen += theoPPH * b.theoMP }
      }
    }
    const ller = llerDen > 0 ? Math.round((llerNum / llerDen) * 100) : 0

    let status = 'Tidak ada data'
    if (actuals.length > 0) status = ller >= 90 ? '✓ Baik' : ller >= 75 ? '⚠ Perlu perhatian' : '✗ Di bawah target'
    else if (model) status = 'Ada model, belum input'

    return [
      line.building, `Line ${line.lineNo}`,
      model?.name ?? '—', '—',
      tph > 0 ? tph : '—',
      totalOut, avgMP, totalDT, totalDef,
      actuals.length ? ller + '%' : '—',
      actuals.length, status,
    ]
  })

  const wsSummary = XLSX.utils.aoa_to_sheet([
    [`LAPORAN HARIAN — ${date}`],
    [`Dicetak: ${new Date().toLocaleString('id-ID')}`],
    [],
    summaryHeader,
    ...summaryRows,
  ])
  wsSummary['!cols'] = [
    { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
    { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 14 },
    { wch: 10 }, { wch: 10 }, { wch: 22 },
  ]
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

  // ─── SHEET 2+: DETAIL PER LINE (yang ada data) ───────────
  for (const line of lines) {
    if (line.actuals.length === 0) continue
    const model = line.assignments[0]?.model
    const sheetName = `Gdg${line.building}-L${line.lineNo}`

    const detailHeader = ['Jam', 'Section', 'Output', 'vs Target', 'MP Hadir', 'Efisiensi MP', 'Downtime (mnt)', 'Alasan DT', 'Defect', 'Defect %']

    const detailRows = line.actuals.map(a => {
      const secTakt = (a.section as any)?.taktTime ?? 0
      const tphRow = secTakt > 0 ? Math.round(3600 / secTakt) : 0
      const gap = tphRow > 0 ? a.output - tphRow : 0
      const defPct = a.output > 0 ? parseFloat((a.defect / a.output * 100).toFixed(2)) : 0
      return [
        `${a.hour}:00`,
        a.section?.name ?? '—',
        a.output,
        gap >= 0 ? `+${gap}` : gap,
        a.mpActual,
        '—',
        a.downtime || '—',
        a.dtReason || '—',
        a.defect || '—',
        defPct > 0 ? defPct + '%' : '—',
      ]
    })

    // Totals row
    const totOut  = line.actuals.reduce((s, a) => s + a.output, 0)
    const totDT   = line.actuals.reduce((s, a) => s + a.downtime, 0)
    const totDef  = line.actuals.reduce((s, a) => s + a.defect, 0)
    const avgMPr  = Math.round(line.actuals.reduce((s, a) => s + a.mpActual, 0) / line.actuals.length)
    const avgOut  = Math.round(totOut / line.actuals.length)
    // LLER produktivitas gabungan — agregat semua section
    const detailTph = (line.actuals[0]?.section as any)?.taktTime > 0
      ? Math.round(3600 / (line.actuals[0]?.section as any).taktTime) : 0
    let dNum = 0, dDen = 0
    const dSecB = new Map<string, { mpS: number; outS: number; hrs: number; tm: number; tk: number }>()
    for (const a of line.actuals) {
      const sec = a.section as any
      const sn = sec?.name ?? ''
      if (!dSecB.has(sn)) {
        let tm = 0
        if (sec?.operations && sec.taktTime > 0) {
          tm = sec.operations.reduce((s: number, op: any) =>
            s + (op.va + op.nvan + op.nva) * (1 + (op.allowance ?? 0.15)), 0) / sec.taktTime
        }
        dSecB.set(sn, { mpS: 0, outS: 0, hrs: 0, tm, tk: sec?.taktTime ?? 0 })
      }
      const b = dSecB.get(sn)!
      b.mpS += a.mpActual; b.outS += a.output; b.hrs += 1
    }
    for (const [, b] of dSecB.entries()) {
      if (b.tm > 0 && b.hrs > 0 && b.tk > 0) {
        const ao = b.outS / b.hrs, am = b.mpS / b.hrs, tp = 3600 / b.tk
        if (ao > 0 && am > 0) { dNum += ao * am; dDen += tp * b.tm }
      }
    }
    const ller = dDen > 0 ? Math.round((dNum / dDen) * 100) : 0

    const wsDetail = XLSX.utils.aoa_to_sheet([
      [`Gedung ${line.building} — Line ${line.lineNo} | Model: ${model?.name ?? '—'} | Target: ${detailTph} pairs/jam`],
      [`Tanggal: ${date} | LLER: ${ller}% | Total Output: ${totOut} pairs | Total Downtime: ${totDT} mnt | Total Defect: ${totDef} pairs`],
      [],
      detailHeader,
      ...detailRows,
      [],
      ['TOTAL / RATA-RATA', '', totOut, '', avgMPr, '', totDT, '', totDef, totOut > 0 ? (totDef / totOut * 100).toFixed(2) + '%' : '—'],
    ])
    wsDetail['!cols'] = [
      { wch: 6 }, { wch: 14 }, { wch: 8 }, { wch: 10 }, { wch: 10 },
      { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 8 }, { wch: 10 },
    ]
    XLSX.utils.book_append_sheet(wb, wsDetail, sheetName)
  }

  // ─── SHEET: ALERTS ───────────────────────────────────────
  const alerts = await prisma.alert.findMany({
    where: {
      triggeredAt: { gte: new Date(date + 'T00:00:00+07:00'), lte: new Date(date + 'T23:59:59+07:00') },
      ...(userBuilding ? { line: { building: userBuilding } } : {}),
    },
    include: { line: { select: { building: true, lineNo: true } } },
    orderBy: { triggeredAt: 'desc' },
  })

  if (alerts.length > 0) {
    const alertRows = alerts.map(a => [
      a.line.building, `Line ${a.line.lineNo}`,
      a.type.replace('_', ' '), a.message,
      a.triggeredAt.toLocaleTimeString('id-ID'),
      a.resolved ? 'Selesai' : 'Aktif',
    ])
    const wsAlerts = XLSX.utils.aoa_to_sheet([
      ['Gedung', 'Line', 'Tipe Alert', 'Pesan', 'Waktu', 'Status'],
      ...alertRows,
    ])
    wsAlerts['!cols'] = [{ wch: 8 }, { wch: 8 }, { wch: 16 }, { wch: 40 }, { wch: 12 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, wsAlerts, 'Alerts')
  }

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const filename = `Laporan_IE_LineBalance_${date}.xlsx`

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}