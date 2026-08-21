import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { requireSession } from '@/lib/api-helpers'
import { getShiftArchives } from '@/lib/shift-archive-query'

// GET /api/export/shift-history?building=&days=&line=B|3&shift=&date=
// Export Excel berformat untuk Riwayat Shift (mengikuti filter yang aktif).
export async function GET(req: NextRequest) {
  const auth = await requireSession()
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const building = searchParams.get('building')
  const days = parseInt(searchParams.get('days') ?? '30', 10)
  const fLine = searchParams.get('line')   // "B|3" atau ALL/null
  const fShift = searchParams.get('shift')  // label atau ALL/null
  const fDate = searchParams.get('date')    // YYYY-MM-DD atau kosong

  let rows = await getShiftArchives(auth, { building, days })

  // Filter sisi server (mirror halaman)
  if (building && building !== 'ALL') rows = rows.filter(r => r.building === building)
  if (fLine && fLine !== 'ALL')       rows = rows.filter(r => `${r.building}|${r.lineNo}` === fLine)
  if (fShift && fShift !== 'ALL')     rows = rows.filter(r => r.shiftLabel === fShift)
  if (fDate)                          rows = rows.filter(r => r.date === fDate)

  // ── Workbook ──
  const wb = new ExcelJS.Workbook()
  wb.creator = 'IE Line Balance System'
  wb.created = new Date()
  const ws = wb.addWorksheet('Riwayat Shift', {
    views: [{ state: 'frozen', ySplit: 8 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  // Palette
  const NAVY = 'FF0F172A', SLATE = 'FF1E293B', LIGHT = 'FFF1F5F9'
  const GREEN = 'FF059669', AMBER = 'FFD97706', RED = 'FFDC2626', MUTED = 'FF64748B'
  const BORDER = 'FFE2E8F0'

  const COLS = [
    { h: 'Tanggal',         w: 14, key: 'date' },
    { h: 'Gedung',          w: 9,  key: 'building' },
    { h: 'Line',            w: 8,  key: 'lineNo' },
    { h: 'Shift',           w: 10, key: 'shift' },
    { h: 'Model / Style',   w: 24, key: 'models' },
    { h: 'Section / Style', w: 28, key: 'sections' },
    { h: 'Output',          w: 11, key: 'output' },
    { h: 'Target',          w: 11, key: 'target' },
    { h: 'Capai %',         w: 10, key: 'ach' },
    { h: 'LLER %',          w: 10, key: 'ller' },
    { h: 'Downtime (mnt)',  w: 14, key: 'dt' },
    { h: 'Defect',          w: 10, key: 'defect' },
    { h: 'Ditutup Oleh',    w: 18, key: 'closedBy' },
    { h: 'Laporan',         w: 12, key: 'report' },
  ]
  ws.columns = COLS.map(c => ({ width: c.w }))

  const lastColLetter = ws.getColumn(COLS.length).letter

  // ── Title ──
  ws.mergeCells(`A1:${lastColLetter}1`)
  const title = ws.getCell('A1')
  title.value = 'RIWAYAT SHIFT — IE Line Balance System'
  title.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(1).height = 30

  // ── Subtitle: filter + generated ──
  ws.mergeCells(`A2:${lastColLetter}2`)
  const fl = []
  fl.push(building && building !== 'ALL' ? `Gedung ${building}` : 'Semua gedung')
  if (fLine && fLine !== 'ALL') fl.push(`Line ${fLine.replace('|', '-')}`)
  if (fShift && fShift !== 'ALL') fl.push(fShift)
  fl.push(fDate ? `Tanggal ${fDate}` : `${days} hari terakhir`)
  const sub = ws.getCell('A2')
  sub.value = `Filter: ${fl.join(' · ')}   |   Dibuat: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`
  sub.font = { name: 'Calibri', size: 9, italic: true, color: { argb: MUTED } }
  sub.alignment = { horizontal: 'left', indent: 1 }
  ws.getRow(2).height = 16

  // ── Summary KPI (row 4-5) ──
  const totalShifts = rows.length
  const avgLler = totalShifts ? Math.round(rows.reduce((s, r) => s + r.avgLler, 0) / totalShifts) : 0
  const totalOutput = rows.reduce((s, r) => s + r.totalOutput, 0)
  const totalDT = rows.reduce((s, r) => s + r.totalDT, 0)
  const totalDefect = rows.reduce((s, r) => s + r.totalDefect, 0)
  const achVals = rows.filter(r => r.achievement !== null).map(r => r.achievement as number)
  const avgAch = achVals.length ? Math.round(achVals.reduce((s, v) => s + v, 0) / achVals.length) : 0

  const kpis: [string, string][] = [
    ['Total Shift', String(totalShifts)],
    ['Rata-rata LLER', `${avgLler}%`],
    ['Total Output', totalOutput.toLocaleString('id-ID') + ' prs'],
    ['Rata-rata Capai', `${avgAch}%`],
    ['Total Downtime', `${totalDT} mnt`],
    ['Total Defect', `${totalDefect} prs`],
  ]
  kpis.forEach(([label, val], i) => {
    const col = 1 + i * 2
    const c1 = ws.getCell(4, col); const c2 = ws.getCell(5, col)
    ws.mergeCells(4, col, 4, col + 1); ws.mergeCells(5, col, 5, col + 1)
    c1.value = label.toUpperCase()
    c1.font = { name: 'Calibri', size: 8, bold: true, color: { argb: MUTED } }
    c1.alignment = { horizontal: 'left', indent: 1 }
    c2.value = val
    c2.font = { name: 'Calibri', size: 14, bold: true, color: { argb: SLATE } }
    c2.alignment = { horizontal: 'left', indent: 1 }
    for (const cc of [c1, c2]) cc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }
  })
  ws.getRow(5).height = 20

  // ── Header (row 7) ──
  const headerRow = ws.getRow(7)
  COLS.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = c.h
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = { bottom: { style: 'thin', color: { argb: NAVY } } }
  })
  headerRow.height = 24

  // ── Data rows (from row 8) ──
  rows.forEach((r, idx) => {
    const rowIdx = 8 + idx
    const row = ws.getRow(rowIdx)
    const dateObj = new Date(r.date + 'T00:00:00+07:00')

    const cells: Record<string, any> = {
      1: dateObj,
      2: r.building,
      3: r.lineNo,
      4: r.shiftLabel,
      5: r.models.length ? r.models.join(', ') : '—',
      6: r.sections.length ? r.sections.join(', ') : '—',
      7: r.totalOutput,
      8: r.target ?? '—',
      9: r.achievement !== null ? r.achievement / 100 : '—',
      10: r.avgLler / 100,
      11: r.totalDT,
      12: r.totalDefect,
      13: r.closedByName,
      14: r.emailSent ? 'Terkirim' : 'Tidak',
    }
    Object.entries(cells).forEach(([k, v]) => {
      const cell = row.getCell(Number(k))
      cell.value = v
      cell.font = { name: 'Calibri', size: 10, color: { argb: SLATE } }
      cell.border = { bottom: { style: 'hair', color: { argb: BORDER } } }
      cell.alignment = { vertical: 'middle' }
    })

    // Formatting per kolom
    row.getCell(1).numFmt = 'dd mmm yyyy'
    row.getCell(1).alignment = { horizontal: 'left' }
    row.getCell(2).alignment = { horizontal: 'center' }
    row.getCell(3).alignment = { horizontal: 'center' }
    row.getCell(7).numFmt = '#,##0'; row.getCell(7).alignment = { horizontal: 'right' }
    if (typeof cells[8] === 'number') { row.getCell(8).numFmt = '#,##0' }
    row.getCell(8).alignment = { horizontal: 'right' }
    if (typeof cells[9] === 'number') row.getCell(9).numFmt = '0"%"'
    row.getCell(9).alignment = { horizontal: 'center' }
    row.getCell(10).numFmt = '0"%"'; row.getCell(10).alignment = { horizontal: 'center' }
    row.getCell(11).alignment = { horizontal: 'center' }
    row.getCell(12).alignment = { horizontal: 'center' }

    // Conditional color — Capai %
    if (r.achievement !== null) {
      const col = r.achievement >= 100 ? GREEN : r.achievement >= 85 ? AMBER : RED
      row.getCell(9).font = { name: 'Calibri', size: 10, bold: true, color: { argb: col } }
    }
    // Conditional color — LLER
    const lc = r.avgLler >= 90 ? GREEN : r.avgLler >= 75 ? AMBER : RED
    row.getCell(10).font = { name: 'Calibri', size: 10, bold: true, color: { argb: lc } }
    // Defect merah kalau ada
    if (r.totalDefect > 0) row.getCell(12).font = { name: 'Calibri', size: 10, color: { argb: RED } }
    // Laporan
    row.getCell(14).font = { name: 'Calibri', size: 10, color: { argb: r.emailSent ? GREEN : MUTED } }
    row.getCell(14).alignment = { horizontal: 'center' }

    // Zebra stripe
    if (idx % 2 === 1) {
      for (let c = 1; c <= COLS.length; c++) {
        const cell = row.getCell(c)
        if (!cell.fill || (cell.fill as any).pattern === undefined) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
        }
      }
    }
  })

  // Autofilter pada header
  ws.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7, column: COLS.length } }

  // Empty state note
  if (rows.length === 0) {
    ws.mergeCells(`A8:${lastColLetter}8`)
    const e = ws.getCell('A8')
    e.value = 'Tidak ada data untuk filter ini.'
    e.font = { name: 'Calibri', size: 11, italic: true, color: { argb: MUTED } }
    e.alignment = { horizontal: 'center' }
  }

  const buf = await wb.xlsx.writeBuffer()
  const stamp = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
  const filename = `Riwayat_Shift_${stamp}.xlsx`

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
