import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import * as XLSX from 'xlsx'
import { today } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') ?? today()
  const userBuilding = (session.user as any)?.building

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
        include: { section: { select: { name: true } } },
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
    const tph = model?.lineType === 'BIG' ? 180 : 100
    const totalOut = actuals.reduce((s, a) => s + a.output, 0)
    const totalDT  = actuals.reduce((s, a) => s + a.downtime, 0)
    const totalDef = actuals.reduce((s, a) => s + a.defect, 0)
    const avgMP = actuals.length ? Math.round(actuals.reduce((s, a) => s + a.mpActual, 0) / actuals.length) : 0
    const avgOut = actuals.length ? Math.round(totalOut / actuals.length) : 0
    const ller = tph > 0 && actuals.length ? Math.round(avgOut / tph * 100) : 0

    let status = 'Tidak ada data'
    if (actuals.length > 0) status = ller >= 90 ? '✓ Baik' : ller >= 75 ? '⚠ Perlu perhatian' : '✗ Di bawah target'
    else if (model) status = 'Ada model, belum input'

    return [
      line.building, `Line ${line.lineNo}`,
      model?.name ?? '—', model ? (model.lineType === 'BIG' ? 'Big Line' : 'Mini Line') : '—',
      model ? tph : '—',
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
    const tph = model?.lineType === 'BIG' ? 180 : 100
    const sheetName = `Gdg${line.building}-L${line.lineNo}`

    const detailHeader = ['Jam', 'Section', 'Output', 'vs Target', 'MP Hadir', 'Efisiensi MP', 'Downtime (mnt)', 'Alasan DT', 'Defect', 'Defect %']

    const detailRows = line.actuals.map(a => {
      const gap = a.output - tph
      const defPct = a.output > 0 ? parseFloat((a.defect / a.output * 100).toFixed(2)) : 0
      return [
        `${a.hour}:00`,
        (a as any).section?.name ?? '—',
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
    const ller    = tph > 0 ? Math.round(avgOut / tph * 100) : 0

    const wsDetail = XLSX.utils.aoa_to_sheet([
      [`Gedung ${line.building} — Line ${line.lineNo} | Model: ${model?.name ?? '—'} | ${model?.lineType === 'BIG' ? 'Big Line' : 'Mini Line'} | Target: ${tph} pairs/jam`],
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
      triggeredAt: { gte: new Date(date + 'T00:00:00'), lte: new Date(date + 'T23:59:59') },
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
