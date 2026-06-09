import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { requireSession } from '@/lib/api-helpers'

// GET /api/templates/download
// Generate template Excel yang bisa diisi IE lalu diupload kembali
export async function GET() {
  const auth = await requireSession()
  if (auth instanceof NextResponse) return auth

  const wb = XLSX.utils.book_new()

  // ─── SHEET 1: MODEL INFO ─────────────────────────────────────
  const infoData = [
    ['FIELD', 'VALUE', 'KETERANGAN'],
    ['Model Name', 'U740', 'Nama model sepatu (wajib, unik)'],
    ['Article', 'U-740', 'Kode artikel'],
    ['Stage', 'Production CFM', 'PTR / Production CFM / Pre-Production'],
    ['Daily Target', '2000', 'Target harian (pairs) — otomatis dari IE data jika upload Excel'],
  ]
  const wsInfo = XLSX.utils.aoa_to_sheet(infoData)
  wsInfo['!cols'] = [{ wch: 16 }, { wch: 24 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Model Info')

  // ─── SHEET 2: OPERATIONS ─────────────────────────────────────
  // Header
  const header = [
    'Section', 'Std MP', 'Takt Time (s)', 'No',
    'Nama Operasi', 'VA (s)', 'NVAN (s)', 'NVA (s)', 'M/C CT (s)', 'Allowance (%)'
  ]

  // Contoh data — IE hapus ini, isi dengan data asli
  const sampleRows = [
    // Cutting
    ['Cutting', 4.5, 36, 1, 'Auto cutting insole', 13, 0, 5, 0, 15],
    ['Cutting', 4.5, 36, 2, 'Manual cut vamp', 18, 0, 0, 0, 15],
    ['Cutting', 4.5, 36, 3, 'Manual cut tongue', 12, 0, 0, 0, 15],
    // Preparation
    ['Preparation', 8.75, 36, 1, 'Cutting loop', 0, 5, 0, 1.4, 15],
    ['Preparation', 8.75, 36, 2, 'Skiving toe overlay', 12.2, 2.3, 0, 8.7, 15],
    // PC Sewing
    ['PC Sewing', 14, 36, 1, 'CS heel cap medial', 35.7, 16, 0, 30.3, 15],
    ['PC Sewing', 14, 36, 2, 'CS heel cap lateral', 23.2, 7.4, 0, 19.3, 15],
    // Sewing
    ['Sewing', 36, 36, 1, 'Tongue lining', 3.5, 1.9, 0, 1.6, 15],
    ['Sewing', 36, 36, 2, 'Stitching heel tab', 9.2, 13.8, 0, 7.2, 15],
    // Assembly
    ['Assembly', 31.5, 36, 1, 'Persiapan upper & insole', 0, 15, 0, 0, 15],
    ['Assembly', 31.5, 36, 2, 'Heating & heel activation', 11, 4, 0, 25, 15],
    ['Assembly', 31.5, 36, 3, 'Jahit insole strobel', 42.7, 5, 0, 34.6, 15],
    // Packing
    ['Packing', 5, 36, 1, 'Cleaning shoe', 17, 0, 0, 0, 15],
    ['Packing', 5, 36, 2, 'Packing & stamp', 26, 0, 0, 0, 15],
    // Stockfit (takt time berbeda!)
    ['Stockfit', 59.25, 14.4, 1, 'Buffing outsole', 0, 7, 0, 0, 15],
    ['Stockfit', 59.25, 14.4, 2, 'Cement outsole', 18, 0, 0, 0, 15],
  ]

  const opsData = [header, ...sampleRows]
  const wsOps = XLSX.utils.aoa_to_sheet(opsData)
  wsOps['!cols'] = [
    { wch: 14 }, { wch: 9 }, { wch: 14 }, { wch: 5 },
    { wch: 32 }, { wch: 9 }, { wch: 9 }, { wch: 9 }, { wch: 10 }, { wch: 12 },
  ]
  XLSX.utils.book_append_sheet(wb, wsOps, 'Operations')

  // ─── SHEET 3: PANDUAN ────────────────────────────────────────
  const guideData = [
    ['PANDUAN PENGISIAN TEMPLATE IE LINE BALANCE SYSTEM'],
    [''],
    ['SHEET: Model Info'],
    ['  Model Name    :', 'Nama model, contoh: U740, U509, dsb. Harus unik.'],
    ['  Article       :', 'Kode artikel lengkap, contoh: U-740'],
    ['  Stage         :', 'PTR / Production CFM / Pre-Production'],
    ['  Target        :', 'Target PPH otomatis dari takt time IE data (3600 / taktTime)'],
    [''],
    ['SHEET: Operations'],
    ['  Section       :', 'Nama section: Cutting / Treatment / Preparation / PC Sewing / Sewing / Assembly / Packing / Stockfit'],
    ['  Std MP        :', 'IE Standard Labor (jumlah MP standar untuk section ini)'],
    ['  Takt Time (s) :', 'Takt time dalam detik. Stockfit biasanya berbeda (misal 14.4s)'],
    ['  No            :', 'Nomor urut operasi dalam section (1, 2, 3, ...)'],
    ['  Nama Operasi  :', 'Nama lengkap operasi'],
    ['  VA (s)        :', 'Value Added time dalam detik'],
    ['  NVAN (s)      :', 'Non-Value Added Necessary dalam detik (misal: waktu tunggu mesin)'],
    ['  NVA (s)       :', 'Non-Value Added (waste) dalam detik'],
    ['  M/C CT (s)    :', 'Machine Cycle Time dalam detik (0 jika tidak ada mesin)'],
    ['  Allowance (%) :', 'Persentase allowance, biasanya 15'],
    [''],
    ['CATATAN PENTING:'],
    ['  - Jangan ubah nama kolom (baris pertama sheet Operations)'],
    ['  - Nama Section harus persis sama di semua baris section yang sama'],
    ['  - Boleh tambah atau hapus baris operasi sesuai kebutuhan'],
    ['  - Boleh tambah section baru selain yang ada di contoh'],
    ['  - Stockfit: isi Takt Time sesuai target Stockfit (biasanya berbeda dari main line)'],
    ['  - VA + NVAN + NVA tidak boleh semua 0 (operasi akan diabaikan)'],
  ]
  const wsGuide = XLSX.utils.aoa_to_sheet(guideData)
  wsGuide['!cols'] = [{ wch: 20 }, { wch: 70 }]
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Panduan')

  // Generate buffer
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="IE_LineBalance_Template.xlsx"',
    },
  })
}
