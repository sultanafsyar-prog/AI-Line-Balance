'use client'
import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { SECTIONS, SF_SECTIONS } from '@/lib/utils'
import Link from 'next/link'

// ─── TYPES ───────────────────────────────────────────────────
type Op = { id: string; name: string; va: number; nvan: number; nva: number; mcCT: number; allowance: number }
type Sec = { name: string; stdMP: number; taktTime: number; ops: Op[] }
type ModelDraft = { name: string; article: string; stage: string; lineType: 'MINI' | 'BIG'; sections: Sec[]; dailyTarget?: number; hourlyTarget?: number }

const ALL_SECTIONS = [...SECTIONS, ...SF_SECTIONS]
const STAGES = ['PTR', 'Pre-Production', 'Production CFM']
const newOp = (): Op => ({ id: Math.random().toString(36).slice(2), name: '', va: 0, nvan: 0, nva: 0, mcCT: 0, allowance: 15 })
const emptyDraft = (): ModelDraft => ({
  name: '', article: '', stage: 'Production CFM', lineType: 'MINI',
  sections: ALL_SECTIONS.map(s => ({ name: s, stdMP: 0, taktTime: s === 'Stockfit' ? 14.4 : 36, ops: [] }))
})

// ─── PARSER NB STANDARD ──────────────────────────────────────
function parseNBStandard(ab: ArrayBuffer): ModelDraft {
    const wb = XLSX.read(ab, { type: 'array' })
    const draft = emptyDraft()

    // ── PENTING: XLSX.js skip kolom A yang kosong ──────────
    // openpyxl col[N] = XLSX.js col[N-1] untuk data columns
    // Mapping yang benar:
    // XLSX.js col[0] = proc no (openpyxl col[1])
    // XLSX.js col[1] = op name (openpyxl col[2])
    // XLSX.js col[7] = VA      (openpyxl col[8])
    // XLSX.js col[8] = NVAN    (openpyxl col[9])
    // XLSX.js col[9] = NVA     (openpyxl col[10])
    // XLSX.js col[10]= M/C CT  (openpyxl col[11])
    // XLSX.js col[12]= Allowance(openpyxl col[13])
    // XLSX.js col[11]= Std MP  (openpyxl col[12]) dari row 4
    // XLSX.js col[7] = Takt    (openpyxl col[8])  dari row 4

    function detectTakt(row: any[], fallback: number): number {
      // Takt ada di col[7] (openpyxl col[8])
      const v7 = parseFloat(row[7])
      if (!isNaN(v7) && v7 >= 5 && v7 <= 300) return v7
      // Fallback: scan semua kolom
      for (let i = 5; i < 15; i++) {
        const v = parseFloat(row[i])
        if (!isNaN(v) && v >= 5 && v <= 300) return v
      }
      return fallback
    }

    function firstVal(row: any[], ...cols: number[]) {
      for (const c of cols) {
        const v = String(row[c] ?? '').trim()
        if (v && v !== '0') return v
      }
      return ''
    }

    // ── 1. LINE BALANCING RESUME ──────────────────────────────
    const rws = wb.Sheets['LINE BALANCING RESUME']
    if (!rws) throw new Error('Sheet "LINE BALANCING RESUME" tidak ditemukan. Pastikan file adalah NB Standard.')
    const rd: any[][] = XLSX.utils.sheet_to_json(rws, { header: 1, defval: '' })

    let mainTakt = 36

    for (const row of rd) {
      const rowStr = row.slice(0, 10).map((v: any) => String(v ?? '').trim())
      const fullRow = rowStr.join('|')
      if (fullRow.toUpperCase().includes('TAKT')) {
        const t = detectTakt(row, 36)
        if (t >= 5) mainTakt = t
      }
      if (fullRow.toUpperCase().includes('ITEM') || fullRow.toUpperCase().includes('MODEL')) {
        const val = firstVal(row, 3, 4, 2, 5, 6)
        if (val) { draft.name = val; draft.article = 'U-' + val }
      }
      if (fullRow.toUpperCase().includes('STAGE') && !fullRow.toUpperCase().includes('SECTION')) {
        const val = firstVal(row, 3, 4, 2)
        if (val && val.length > 2 && isNaN(parseFloat(val))) draft.stage = val
      }
    }

    // Fallback model name dari LB sheet
    if (!draft.name) {
      for (const sn of wb.SheetNames) {
        if (!sn.toLowerCase().startsWith('lb ')) continue
        const ws = wb.Sheets[sn]
        const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
        const r4 = data[3] ?? []
        // XLSX.js: col[1]=model no (karena col A skip), col[2]=section name
        const modelNo = String(r4[1] ?? '').trim()
        if (modelNo && !isNaN(parseInt(modelNo)) && parseInt(modelNo) > 100) {
          draft.name = modelNo; draft.article = 'U-' + modelNo; break
        }
      }
    }

    if (!draft.name) throw new Error('Model/Article tidak ditemukan.')
    draft.lineType = mainTakt <= 22 ? 'BIG' : 'MINI'

    // ── 2. Mapping sheet LB → section ───────────────────────
    const sheetCfg: Record<string, { sec: string }> = {
      'lb cutting in line': { sec: 'Cutting'     },
      'lb prep':            { sec: 'Preparation' },
      'lb pc sewing':       { sec: 'PC Sewing'   },
      'lb sewing':          { sec: 'Sewing'       },
      'lb  assembly':       { sec: 'Assembly'    },
      'lb stockfit':        { sec: 'Stockfit'    },
    }

    // ── 3. Proses sheet LB satu per satu ────────────────────
    for (const sheetName of wb.SheetNames) {
      const nameLower = sheetName.toLowerCase().trim()
      if (!nameLower.startsWith('lb ')) continue
      const cfgEntry = Object.entries(sheetCfg).find(([k]) => nameLower === k)
      if (!cfgEntry) continue
      const [, cfg] = cfgEntry

      const ws = wb.Sheets[sheetName]
      const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      const r4 = data[3] ?? []

      // Takt time: XLSX.js col[7] = openpyxl col[8]
      const sheetTakt = detectTakt(r4, mainTakt)
      const finalTakt = sheetTakt >= 5 ? sheetTakt : mainTakt

      // Std MP: XLSX.js col[11] = openpyxl col[12]
      // Jika stockfit, gunakan nilai yang relevan
      const stdMPRaw = parseFloat(r4[11]) || parseFloat(r4[12]) || 0
      const stdMP = stdMPRaw >= 1 && stdMPRaw <= 200 ? stdMPRaw : 0

      const secInDraft = draft.sections.find(s => s.name === cfg.sec)
      if (secInDraft) {
        secInDraft.taktTime = finalTakt
        if (stdMP > 0) secInDraft.stdMP = stdMP
      }

      const ops: any[] = []
      // Operasi mulai row 11 (index 10)
      for (let i = 10; i < data.length; i++) {
        const r = data[i]

        // XLSX.js col[1] = op name (openpyxl col[2])
        // Fallback ke col[2] untuk sub-operasi
        const opName = String(r[1] ?? '').trim() || String(r[2] ?? '').trim()
        if (!opName) continue
        if (opName.toLowerCase().includes('total') || opName.toLowerCase().includes('subtotal')) break
        if (opName.toLowerCase() === 'operation name' || opName.toLowerCase() === 'nama operasi') continue

        // ── KOLOM YANG BENAR (setelah shift -1) ─────────────
        // XLSX.js col[7]  = VA       (openpyxl col[8])
        // XLSX.js col[8]  = NVAN     (openpyxl col[9])
        // XLSX.js col[9]  = NVA      (openpyxl col[10])
        // XLSX.js col[10] = M/C CT   (openpyxl col[11])
        // XLSX.js col[12] = Allowance(openpyxl col[13])
        const va   = parseFloat(r[7])  || 0
        const nvan = parseFloat(r[8])  || 0
        const nva  = parseFloat(r[9])  || 0
        const mcCT = parseFloat(r[10]) || 0
        const al   = parseFloat(r[12]) || 0.15

        if (va + nvan + nva === 0) continue

        ops.push({
          id: Math.random().toString(36).slice(2),
          name: opName, va, nvan, nva, mcCT,
          allowance: al > 1 ? al / 100 : al,
        })
      }

      if (ops.length > 0 && secInDraft) secInDraft.ops = ops
    }

    const filledSecs = draft.sections.filter(s => s.ops.length > 0)
    if (filledSecs.length === 0)
      throw new Error('Tidak ada operasi yang terbaca. Pastikan file adalah NB Standard (bukan IE data file).')

    return draft
  }

  // ── PARSER FORMAT IE DATA (Time Study format) ─────────────
  // Format: Cutt In Line, Prep, PC Sewing trial X, Stit, Assembly, Stockfit, Treatment
  function parseIEData(ab: ArrayBuffer): ModelDraft {
    const wb = XLSX.read(ab, { type: 'array' })
    const draft = emptyDraft()

    // Mapping sheet name → section
    const sheetSecMap: Record<string, string> = {
      'cutt in line': 'Cutting',
      'cutting in line': 'Cutting',
      'treatment': 'Treatment',
      'prep': 'Preparation',
      'preparation': 'Preparation',
      'pc sewing trial 1': 'PC Sewing',
      'pc sewing': 'PC Sewing',
      'stit': 'Sewing',
      'stitching': 'Sewing',
      'sewing': 'Sewing',
      'assembly': 'Assembly',
      'stockfit': 'Stockfit',
      'stockfitting': 'Stockfit',
      // Stockfit area sections (Degreaser merged into UV)
      'buffing': 'Buffing',
      'uv': 'UV',
      'degreeser': 'UV',
      'degreaser': 'UV',
    }

    // Cari model name, takt time, daily/hourly target dari sheet manapun
    let modelName = ''
    let mainTakt = 36
    let dailyTarget = 0
    let hourlyTarget = 0

    for (const sn of wb.SheetNames) {
      const ws = wb.Sheets[sn]
      const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      for (const row of data.slice(0, 10)) {
        // Cari "Style:" di kolom mana saja
        for (let c = 0; c < Math.min(row.length, 8); c++) {
          const cellStr = String(row[c] ?? '').toLowerCase()
          if (cellStr.includes('style')) {
            // Cari nilai di kolom berikutnya
            for (let nc = c + 1; nc < Math.min(c + 5, row.length); nc++) {
              const v = String(row[nc] ?? '').trim()
              if (v && v.length > 2 && !v.toLowerCase().includes('date') && !v.toLowerCase().includes('line')) {
                if (!modelName) modelName = v.split(',')[0].trim()
              }
            }
          }
          // Also check col[1] or col[3] for model name in "LINE BALANCING - ..." format
          if (cellStr.includes('line balancing') && !modelName) {
            // Model name usually in col[3] for stockfit area format
            const v3 = String(row[3] ?? '').trim()
            if (v3 && v3.length > 2) modelName = v3.split('/')[0].trim()
          }
          if (cellStr.includes('takt')) {
            for (let nc = c + 1; nc < Math.min(c + 5, row.length); nc++) {
              const v = parseFloat(row[nc])
              if (!isNaN(v) && v >= 5 && v <= 300) mainTakt = v
            }
          }
          if (cellStr.includes('daily target') && dailyTarget === 0) {
            for (let nc = c + 1; nc < Math.min(c + 5, row.length); nc++) {
              const v = parseFloat(row[nc])
              if (!isNaN(v) && v >= 10) { dailyTarget = v; break }
            }
          }
          if (cellStr.includes('hourly target') && hourlyTarget === 0) {
            for (let nc = c + 1; nc < Math.min(c + 5, row.length); nc++) {
              const v = parseFloat(row[nc])
              if (!isNaN(v) && v >= 1) { hourlyTarget = v; break }
            }
          }
        }
      }
      if (modelName) break
    }

    if (!modelName) throw new Error('Model/Style tidak ditemukan di file IE Data.')
    draft.name = modelName
    draft.article = modelName
    draft.lineType = mainTakt <= 22 ? 'BIG' : 'MINI'
    if (dailyTarget > 0) draft.dailyTarget = dailyTarget
    if (hourlyTarget > 0) draft.hourlyTarget = hourlyTarget

    // Process setiap sheet
    const processedSecs = new Set<string>()

    for (const sn of wb.SheetNames) {
      const nameLower = sn.toLowerCase().trim()

      // Cari matching section (skip "summary", "all", dan duplicate sheets)
      if (nameLower.includes('summary')) continue
      if (nameLower.startsWith('all ')) continue
      if (nameLower.includes('(2)') || nameLower.includes('trial 2')) continue

      const secName = sheetSecMap[nameLower] ??
        Object.entries(sheetSecMap).find(([k]) => nameLower.startsWith(k))?.[1] ??
        Object.entries(sheetSecMap).find(([k]) => nameLower.includes(k))?.[1]

      if (!secName) continue
      // Allow merging: Degreeser + UV both map to 'UV', append ops instead of skip
      const isMerging = processedSecs.has(secName)

      const ws = wb.Sheets[sn]
      const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

      // Cari header row: row dengan "NO" di col[0]
      let headerRowIdx = -1
      let taktLocal = mainTakt
      let stdMP = 0

      for (let i = 0; i < Math.min(data.length, 15); i++) {
        const r = data[i]
        // Cari takt time + Number of Operator (stdMP total)
        for (let c = 0; c < Math.min(r.length - 1, 15); c++) {
          const cellStr = String(r[c] ?? '').toLowerCase()
          if (cellStr.includes('takt')) {
            for (let nc = c + 1; nc < Math.min(c + 4, r.length); nc++) {
              const v = parseFloat(r[nc])
              if (!isNaN(v) && v >= 5 && v <= 300) taktLocal = v
            }
          }
          if ((cellStr.includes('number of operator') || cellStr.includes('jumlah operator')) && stdMP === 0) {
            for (let nc = c + 1; nc < Math.min(c + 3, r.length); nc++) {
              const v = parseFloat(r[nc])
              if (!isNaN(v) && v >= 1 && v <= 500) { stdMP = Math.round(v); break }
            }
          }
        }
        // Cari header row
        const c0 = String(r[0] ?? '').trim().toUpperCase()
        if (c0 === 'NO' || c0 === 'NO.') { headerRowIdx = i; break }
      }

      if (headerRowIdx === -1) continue

      // Baca header untuk mapping kolom
      const headerRow = data[headerRowIdx]
      let colGWT = -1, colOpName = -1, colStdMP = -1, colRawCT = -1, colAl = -1

      headerRow.forEach((h: any, idx: number) => {
        const hStr = String(h ?? '').toLowerCase().trim()
        if (hStr === 'gwt' && colGWT === -1) colGWT = idx
        if ((hStr.includes('standard mp') || hStr.includes('std mp') || hStr === 'standard m/p') && colStdMP === -1) colStdMP = idx
        if ((hStr.includes('sec/pair') || hStr === 'sec/pairs (o' || hStr.includes('sec/pairs')) && colRawCT === -1) colRawCT = idx
        if ((hStr.includes('% allow') || hStr === 'allowance') && colAl === -1) colAl = idx
        // Op name: biasanya kolom ke-3 dengan header "Process" atau "Component"
        if ((hStr.includes('process') || hStr.includes('component') || hStr.includes('operation')) && idx >= 1 && colOpName === -1) {
          // Check next column with same/similar header for the actual name column
          colOpName = idx + 1 // op name usually in next column
        }
      })

      // Fallback: op name biasanya col[2] untuk semua format
      if (colOpName === -1 || colOpName < 1) colOpName = 2
      if (colGWT === -1) colGWT = 6 // default fallback

      const ops: any[] = []
      let firstStdMPFound = false

      // Parse dari baris setelah header
      for (let i = headerRowIdx + 1; i < data.length; i++) {
        const r = data[i]

        // Stop jika baris total/summary
        const c0str = String(r[0] ?? '').trim()
        const c1str = String(r[1] ?? '').trim()
        if (!c0str && !c1str) continue // skip baris kosong

        const opName = String(r[colOpName] ?? '').trim() ||
                      String(r[colOpName - 1] ?? '').trim() ||
                      String(r[2] ?? '').trim()
        if (!opName) continue
        if (opName.toLowerCase().includes('total') || opName.toLowerCase().includes('sum')) break

        // GWT: coba kolom GWT, fallback ke raw CT × (1+al)
        let gwt = parseFloat(r[colGWT]) || 0
        if (gwt === 0) {
          const rawCT = parseFloat(r[colRawCT >= 0 ? colRawCT : 3]) || 0
          const al = parseFloat(r[colAl >= 0 ? colAl : 4]) || 0.15
          gwt = rawCT * (1 + al)
        }
        if (gwt <= 0) continue

        // Ambil stdMP dari baris pertama yang punya nilai (setiap group)
        if (!firstStdMPFound && colStdMP >= 0) {
          const mp = parseFloat(r[colStdMP])
          if (!isNaN(mp) && mp >= 0.5 && mp <= 200) {
            stdMP = mp
            firstStdMPFound = true
          }
        }
        // Akumulasi stdMP dari semua group
        if (colStdMP >= 0) {
          const mp = parseFloat(r[colStdMP])
          if (!isNaN(mp) && mp >= 0.5 && mp <= 200 && mp > stdMP) stdMP = mp
        }

        // Allowance
        const alValue = colAl >= 0 ? parseFloat(r[colAl]) || 0.15 : 0.15
        const al = alValue > 1 ? alValue : alValue // kalau > 1 berarti sudah dalam nilai (bukan persen)

        // Simpan sebagai VA (IE data tidak pisah VA/NVAN/NVA)
        ops.push({
          id: Math.random().toString(36).slice(2),
          name: opName,
          va: gwt / (1 + (al > 1 ? al/100 : al)), // raw CT
          nvan: 0, nva: 0, mcCT: 0,
          allowance: al > 1 ? al / 100 : al,
        })
      }

      if (ops.length > 0) {
        const secInDraft = draft.sections.find(s => s.name === secName)
        if (secInDraft) {
          // If merging (e.g. Degreeser ops into UV), append; otherwise replace
          if (isMerging) {
            secInDraft.ops = [...secInDraft.ops, ...ops]
            if (stdMP > 0) secInDraft.stdMP += stdMP
          } else {
            secInDraft.ops = ops
            secInDraft.taktTime = taktLocal
            if (stdMP > 0) secInDraft.stdMP = stdMP
          }
        }
        processedSecs.add(secName)
      }
    }

    if (draft.sections.filter(s => s.ops.length > 0).length === 0)
      throw new Error('Tidak ada operasi yang terbaca dari file IE Data.')

    return draft
  }

  // ── PARSER STOCKFIT NB STANDARD ─────────────────────────────
  // Format: sheet per model (U740, U509, etc.)
  // Kolom C = section (BUFFING, DEGREESER, UV, STOCKFIT)
  // Semua section dalam 1 sheet, bukan sheet terpisah
  function parseStockfitNBStandard(ab: ArrayBuffer, targetSheet?: string): ModelDraft {
    const wb = XLSX.read(ab, { type: 'array' })

    // Section name mapping dari Excel → sistem
    const SEC_MAP: Record<string, string> = {
      'BUFFING': 'Buffing',
      'DEGREESER': 'UV',
      'DEGREASER': 'UV',
      'UV': 'UV',
      'STOCKFIT': 'Stockfit',
      'STOCKFITTING': 'Stockfit',
    }

    // Pilih sheet (default: pertama yang valid)
    const sheetName = targetSheet ?? wb.SheetNames.find(sn => {
      const ws = wb.Sheets[sn]
      const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      const r4 = data[3] ?? []
      return String(r4[0] ?? '').toLowerCase().includes('stockfit')
    }) ?? wb.SheetNames[0]

    const ws = wb.Sheets[sheetName]
    if (!ws) throw new Error(`Sheet "${sheetName}" tidak ditemukan.`)
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

    // ── Header dari row 4 (index 3) ──
    // XLSX.js: col A kosong → shift -1
    // [0]=process, [1]=model#, [3]=article, [5]=workTime, [6]=target/hr, [7]=taktTime, [8]=allowance, [9]=theoMP, [11]=ieStdMP
    const r4 = data[3] ?? []
    const modelNo  = String(r4[1] ?? sheetName).trim()
    const article  = String(r4[3] ?? '').trim()
    const taktTime = parseFloat(r4[7]) || 14.4
    const ieStdMP  = parseFloat(r4[11]) || 0

    const draft: ModelDraft = {
      name: `${modelNo}`,
      article: article ? `${article}-${modelNo}` : modelNo,
      stage: 'Production CFM',
      lineType: taktTime <= 15 ? 'MINI' : 'BIG',
      sections: SF_SECTIONS.map(s => ({ name: s, stdMP: 0, taktTime, ops: [] })),
    }

    // ── Parse operations dari row 11+ (index 10+) ──
    let currentSection = ''
    const sectionOps: Record<string, Op[]> = {}
    const sectionMP: Record<string, number> = {}

    for (let i = 10; i < data.length; i++) {
      const r = data[i]
      const procNo = parseFloat(r[0])
      if (isNaN(procNo) || procNo <= 0) continue

      // Col C = section name (hanya muncul di operasi pertama setiap section)
      const colC = String(r[1] ?? '').trim().toUpperCase()
      if (colC && SEC_MAP[colC]) {
        currentSection = SEC_MAP[colC]
      }
      if (!currentSection) continue

      // Col D = operation name (sub-name)
      const opName = String(r[2] ?? '').trim()
      if (!opName) continue
      if (opName.toLowerCase().includes('total') || opName.toLowerCase().includes('water spider')) break

      // Kolom waktu (XLSX.js shifted -1 dari Excel)
      // [7]=VA(I), [8]=NVAN(J), [9]=NVA(K), [10]=M/C CT(L), [12]=Allowance(N)
      const va   = parseFloat(r[7])  || 0
      const nvan = parseFloat(r[8])  || 0
      const nva  = parseFloat(r[9])  || 0
      const mcCT = parseFloat(r[10]) || 0
      const al   = parseFloat(r[12]) || 0.15

      if (va + nvan + nva === 0) continue

      if (!sectionOps[currentSection]) sectionOps[currentSection] = []
      sectionOps[currentSection].push({
        id: Math.random().toString(36).slice(2),
        name: opName,
        va, nvan, nva, mcCT,
        allowance: al > 1 ? al / 100 : al,
      })

      // Track IE Std MP per section dari col U (index 19)
      const stdMPVal = parseFloat(r[19])
      if (!isNaN(stdMPVal) && stdMPVal > 0) {
        sectionMP[currentSection] = (sectionMP[currentSection] ?? 0) + stdMPVal
      }
    }

    // ── Parse MP summary dari bawah sheet (row "Summary Manpower Needed") ──
    for (let i = data.length - 10; i < data.length; i++) {
      const r = data[i] ?? []
      const label = String(r[0] ?? '').toLowerCase()
      if (label === 'input' || label === 'process') {
        // Next row has MP values
        const mpRow = data[i] ?? r
        // E=Buffing, G=Degreaser, I=UV, M=Stockfit (shifted: [3]=Buff, [5]=Degr, [7]=UV, [11]=SF)
        const buffMP  = parseFloat(mpRow[3]) || 0
        const degrMP  = parseFloat(mpRow[5]) || 0
        const uvMP    = parseFloat(mpRow[7]) || 0
        const sfMP    = parseFloat(mpRow[11]) || 0
        if (buffMP > 0) sectionMP['Buffing']   = buffMP
        // Degreaser + UV digabung ke UV (overwrite, bukan accumulate — hindari double-count dari op loop)
        if (degrMP > 0 || uvMP > 0) sectionMP['UV'] = degrMP + uvMP
        if (sfMP > 0)   sectionMP['Stockfit']  = sfMP
      }
    }

    // ── Assign ops + stdMP ke draft sections ──
    for (const sec of draft.sections) {
      sec.ops = sectionOps[sec.name] ?? []
      sec.stdMP = Math.round(sectionMP[sec.name] ?? 0)
    }

    const filledSecs = draft.sections.filter(s => s.ops.length > 0)
    if (filledSecs.length === 0) {
      throw new Error(`Tidak ada operasi terbaca dari sheet "${sheetName}". Pastikan format sesuai NB Standard Stockfit.`)
    }

    return draft
  }

  // Deteksi format file: NB Standard, IE Data, atau Stockfit NB Standard
  function detectAndParse(ab: ArrayBuffer): ModelDraft {
    const wb = XLSX.read(ab, { type: 'array' })
    const sheetNames = wb.SheetNames.map(s => s.toLowerCase())

    // NB Standard: ada sheet "LINE BALANCING RESUME" dan "LB " prefix
    if (sheetNames.some(s => s.includes('line balancing resume')) &&
        sheetNames.some(s => s.startsWith('lb '))) {
      return parseNBStandard(ab)
    }

    // Stockfit NB Standard: sheet pertama row 4 berisi "Stockfitting"/"Stockfit"
    try {
      const firstSheet = wb.Sheets[wb.SheetNames[0]]
      const data: any[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' })
      const r4 = data[3] ?? []
      const processName = String(r4[0] ?? '').toLowerCase()
      if (processName.includes('stockfit')) {
        return parseStockfitNBStandard(ab)
      }
      // Also check if col C has section markers (BUFFING, DEGREESER, etc.)
      for (let i = 10; i < Math.min(data.length, 30); i++) {
        const colC = String((data[i] ?? [])[1] ?? '').toUpperCase()
        if (['BUFFING', 'DEGREESER', 'DEGREASER', 'UV', 'STOCKFIT'].includes(colC)) {
          return parseStockfitNBStandard(ab)
        }
      }
    } catch {}

    // IE Data: ada sheet seperti "Assembly", "Stockfit", "Prep", "Stit", "Buffing", "UV"
    if (sheetNames.some(s => s === 'assembly' || s === 'stockfit' || s === 'stit' || s === 'prep'
        || s === 'buffing' || s === 'uv' || s === 'degreeser' || s === 'degreaser')) {
      return parseIEData(ab)
    }

    // Default: coba NB Standard
    try { return parseNBStandard(ab) } catch {
      return parseIEData(ab)
    }
  }

// ─── EDITABLE OP ROW ─────────────────────────────────────────
function OpRow({ op, onChange, onDelete }: { op: Op; onChange: (op: Op) => void; onDelete: () => void }) {
  const gwt = parseFloat(((op.va + op.nvan + op.nva) * (1 + op.allowance)).toFixed(2))
  function upd(field: keyof Op, val: string) {
    onChange({ ...op, [field]: field === 'name' ? val : parseFloat(val) || 0 })
  }
  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50 group">
      <td className="px-2 py-1">
        <input className="w-full text-sm px-1 py-0.5 border-0 bg-transparent focus:bg-white focus:border focus:border-gray-200 rounded" value={op.name} onChange={e => upd('name', e.target.value)} placeholder="Nama operasi..." />
      </td>
      {(['va','nvan','nva','mcCT'] as const).map(f => (
        <td key={f} className="px-1 py-1 w-16">
          <input type="number" min="0" step="0.1" className="w-full text-xs text-center px-1 py-0.5 border-0 bg-transparent focus:bg-white focus:border focus:border-gray-200 rounded" value={op[f] || ''} onChange={e => upd(f, e.target.value)} placeholder="0" />
        </td>
      ))}
      <td className="px-2 py-1 text-xs text-center font-medium text-gray-700">{gwt}</td>
      <td className="px-2 py-1 w-8">
        <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-lg leading-none">×</button>
      </td>
    </tr>
  )
}

// ─── EDITOR FORM ─────────────────────────────────────────────
function ModelEditor({ draft: init, onSave, onCancel }: { draft: ModelDraft; onSave: (d: ModelDraft) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<ModelDraft>(JSON.parse(JSON.stringify(init)))
  const [selSec, setSelSec] = useState(draft.sections.find(s => s.ops.length > 0)?.name ?? draft.sections[0].name)
  const [saving, setSaving] = useState(false)

  const section = draft.sections.find(s => s.name === selSec)!

  function updModel(field: keyof ModelDraft, val: any) {
    setDraft(d => ({ ...d, [field]: val }))
  }

  function updSection(field: keyof Sec, val: any) {
    setDraft(d => ({ ...d, sections: d.sections.map(s => s.name === selSec ? { ...s, [field]: val } : s) }))
  }

  function updOp(id: string, updated: Op) {
    setDraft(d => ({ ...d, sections: d.sections.map(s => s.name === selSec ? { ...s, ops: s.ops.map(o => o.id === id ? updated : o) } : s) }))
  }

  function deleteOp(id: string) {
    setDraft(d => ({ ...d, sections: d.sections.map(s => s.name === selSec ? { ...s, ops: s.ops.filter(o => o.id !== id) } : s) }))
  }

  function addOp() {
    setDraft(d => ({ ...d, sections: d.sections.map(s => s.name === selSec ? { ...s, ops: [...s.ops, newOp()] } : s) }))
  }

  async function handleSave() {
    if (!draft.name) return alert('Nama model wajib diisi')
    setSaving(true)
    await onSave(draft)
    setSaving(false)
  }

  const filledSections = draft.sections.filter(s => s.ops.length > 0)
  const totalOps = draft.sections.reduce((sum, s) => sum + s.ops.length, 0)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-auto p-4">
      <div className="bg-white rounded-xl w-full max-w-5xl my-4 shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {init.name ? `Edit Model — ${init.name}` : 'Buat Model Baru'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">{filledSections.length} section · {totalOps} operasi total</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel} className="btn btn-secondary text-sm">Batal</button>
            <button onClick={handleSave} disabled={saving} className="btn btn-primary text-sm">
              {saving ? 'Menyimpan...' : '✓ Simpan model'}
            </button>
          </div>
        </div>

        {/* Model info */}
        <div className="px-6 py-3 border-b border-gray-100 bg-gray-50">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="label">Model name *</label>
              <input className="input text-sm" value={draft.name} onChange={e => updModel('name', e.target.value)} placeholder="U740" />
            </div>
            <div>
              <label className="label">Article</label>
              <input className="input text-sm" value={draft.article} onChange={e => updModel('article', e.target.value)} placeholder="U-740" />
            </div>
            <div>
              <label className="label">Stage</label>
              <select className="input text-sm" value={draft.stage} onChange={e => updModel('stage', e.target.value)}>
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {draft.dailyTarget ? (
              <div>
                <label className="label">Target Harian</label>
                <div className="input text-sm bg-gray-50">{draft.dailyTarget} pairs/hari ({draft.hourlyTarget ?? Math.round(draft.dailyTarget / 8)} prs/jam)</div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Section tabs + content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Section sidebar */}
          <div className="w-40 flex-shrink-0 border-r border-gray-100 overflow-y-auto py-2">
            {draft.sections.map(s => (
              <button key={s.name} onClick={() => setSelSec(s.name)}
                className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between ${selSec === s.name ? 'bg-teal-light text-teal-dark font-medium' : 'text-gray-500 hover:bg-gray-50'}`}>
                <span>{s.name}</span>
                {s.ops.length > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${selSec === s.name ? 'bg-teal text-white' : 'bg-gray-200 text-gray-600'}`}>
                    {s.ops.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Operations */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Section header */}
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex items-center gap-4">
              <span className="text-sm font-medium text-gray-700">{selSec}</span>
              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1 text-gray-500">
                  Std MP:
                  <input type="number" step="0.25" min="0" className="w-16 px-1 py-0.5 border border-gray-200 rounded text-center text-xs" value={section.stdMP || ''} onChange={e => updSection('stdMP', parseFloat(e.target.value) || 0)} />
                  <span>orang</span>
                </label>
                <label className="flex items-center gap-1 text-gray-500">
                  Takt time:
                  <input type="number" step="0.1" min="1" className="w-16 px-1 py-0.5 border border-gray-200 rounded text-center text-xs" value={section.taktTime} onChange={e => updSection('taktTime', parseFloat(e.target.value) || 36)} />
                  <span>detik</span>
                </label>
              </div>
            </div>

            {/* Operations table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-2 text-xs text-gray-500 font-medium">Nama Operasi</th>
                    <th className="px-1 py-2 text-xs text-gray-500 font-medium w-16 text-center">VA (s)</th>
                    <th className="px-1 py-2 text-xs text-gray-500 font-medium w-16 text-center">NVAN (s)</th>
                    <th className="px-1 py-2 text-xs text-gray-500 font-medium w-16 text-center">NVA (s)</th>
                    <th className="px-1 py-2 text-xs text-gray-500 font-medium w-16 text-center">M/C CT</th>
                    <th className="px-2 py-2 text-xs text-gray-500 font-medium w-16 text-center">GWT (s)</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {section.ops.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-8 text-gray-400 text-sm">Belum ada operasi — klik "+ Tambah operasi" di bawah</td></tr>
                  ) : (
                    section.ops.map(op => (
                      <OpRow key={op.id} op={op} onChange={updated => updOp(op.id, updated)} onDelete={() => deleteOp(op.id)} />
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Add operation */}
            <div className="px-4 py-2 border-t border-gray-100">
              <button onClick={addOp} className="text-xs text-teal hover:text-teal-dark font-medium flex items-center gap-1">
                <span className="text-base leading-none">+</span> Tambah operasi
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────
export default function ModelsPage() {
  const [models, setModels] = useState<any[]>([])
  const [editor, setEditor] = useState<ModelDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [parseMsg, setParseMsg] = useState('')
  const [parseError, setParseError] = useState('')

  useEffect(() => {
    fetch('/api/models').then(r => r.json()).then(d => { setModels(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setParseError(''); setParseMsg('')
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const ab = ev.target!.result as ArrayBuffer
        const wb = XLSX.read(ab, { type: 'array' })

        // Check if Stockfit multi-model format
        const firstData: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
        const isStockfit = String((firstData[3] ?? [])[0] ?? '').toLowerCase().includes('stockfit')

        if (isStockfit && wb.SheetNames.length > 1) {
          // Multi-model Stockfit: upload all sheets
          let successCount = 0, failCount = 0
          for (const sn of wb.SheetNames) {
            try {
              const draft = parseStockfitNBStandard(ab, sn)
              if (draft.sections.filter(s => s.ops.length > 0).length === 0) continue
              draft.name = `SF-${draft.name}` // prefix untuk identifikasi Stockfit model
              await saveModel(draft)
              successCount++
            } catch {
              failCount++
            }
          }
          setParseMsg(`Stockfit: ${successCount} model berhasil diupload${failCount > 0 ? `, ${failCount} gagal` : ''}. Refresh halaman.`)
          setTimeout(() => window.location.reload(), 2000)
        } else {
          // Single model
          const draft = detectAndParse(ab)
          const filledSecs = draft.sections.filter(s => s.ops.length > 0)
          const totalOps = filledSecs.reduce((sum, s) => sum + s.ops.length, 0)
          const targetInfo = draft.dailyTarget ? ` · Target: ${draft.dailyTarget} prs/hari` : ''
          setParseMsg(`Berhasil membaca ${filledSecs.length} section, ${totalOps} operasi${targetInfo}${!draft.name ? ' — nama model tidak terbaca, isi manual' : ''}`)
          setEditor(draft)
        }
      } catch (err: any) {
        setParseError('Gagal baca file: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  async function saveModel(draft: ModelDraft) {
    const existingId = (draft as any)._id
    const payload = {
      name: draft.name, article: draft.article,
      stage: draft.stage, lineType: draft.lineType,
      uploadedFrom: existingId ? undefined : 'NB Standard + manual review',
      dailyTarget: draft.dailyTarget,
      hourlyTarget: draft.hourlyTarget,
      sections: draft.sections
        .filter(s => s.ops.length > 0)
        .map(s => ({
          name: s.name, stdMP: s.stdMP, taktTime: s.taktTime,
          ops: s.ops.map(op => ({ ...op, allowance: op.allowance <= 1 ? op.allowance : op.allowance / 100 }))
        }))
    }
    const url    = existingId ? `/api/models/${existingId}` : '/api/models'
    const method = existingId ? 'PATCH' : 'POST'
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      const saved = await res.json()
      setModels(prev => existingId
        ? prev.map(m => m.id === saved.id ? saved : m)
        : [saved, ...prev]
      )
      setEditor(null)
    } else {
      alert('Gagal simpan. Cek konsol untuk detail.')
    }
  }

  async function loadModelForEdit(id: string) {
    const res = await fetch(`/api/models/${id}`)
    if (!res.ok) return
    const m = await res.json()
    const draft: ModelDraft = {
      name: m.name, article: m.article, stage: m.stage, lineType: m.lineType,
      sections: ALL_SECTIONS.map(secName => {
        const dbSec = m.sections?.find((s: any) => s.name === secName)
        return {
          name: secName,
          stdMP: dbSec?.stdMP ?? 0,
          taktTime: dbSec?.taktTime ?? (secName === 'Stockfit' ? 14.4 : 36),
          ops: (dbSec?.operations ?? []).map((op: any) => ({
            id: op.id ?? Math.random().toString(36).slice(2),
            name: op.name, va: op.va, nvan: op.nvan, nva: op.nva,
            mcCT: op.mcCT, allowance: op.allowance,
          }))
        }
      })
    }
    // Store model id for update
    ;(draft as any)._id = id
    setEditor(draft)
  }

  async function deleteModel(id: string, name: string) {
    if (!confirm(`Hapus model ${name}? Tindakan ini tidak dapat dibatalkan.`)) return
    const res = await fetch(`/api/models/${id}`, { method: 'DELETE' })
    if (res.ok) setModels(prev => prev.filter(m => m.id !== id))
  }

  if (loading) return <div className="text-gray-400 text-sm p-8">Memuat...</div>

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Model library</h1>
          <p className="text-sm text-gray-500 mt-1">{models.length} model tersimpan</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {/* Download template panduan */}
          <a href="/api/templates" className="btn btn-secondary text-xs">↓ Template Excel</a>
          {/* Upload NB Standard */}
          <label className="btn btn-primary cursor-pointer text-sm">
            ↑ Upload NB Standard
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
          </label>
          {/* Buat manual */}
          <button onClick={() => setEditor(emptyDraft())} className="btn btn-secondary text-sm">+ Buat manual</button>
        </div>
      </div>

      {/* Info upload */}
      {parseMsg && (
        <div className="mb-4 px-4 py-3 bg-teal-light border border-teal rounded-lg text-sm text-teal-dark flex items-start gap-2">
          <span>✓</span>
          <div>
            <strong>File NB Standard terbaca.</strong> {parseMsg}
            <br /><span className="text-xs opacity-80">Cek dan koreksi data di bawah sebelum menyimpan.</span>
          </div>
        </div>
      )}
      {parseError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">⚠ {parseError}</div>
      )}

      {/* How it works */}
      {models.length === 0 && !parseMsg && (
        <div className="card p-5 mb-6 border-dashed border-2 border-gray-200">
          <div className="text-sm font-medium text-gray-700 mb-3">Cara menambahkan model:</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-500">
            <div className="flex gap-2">
              <span className="w-5 h-5 bg-teal text-white rounded-full flex items-center justify-center flex-shrink-0 font-medium">1</span>
              <div><strong className="text-gray-700">Upload NB Standard</strong><br/>Upload file Excel NB Standard. Sistem otomatis baca data, lalu bisa dikoreksi sebelum simpan.</div>
            </div>
            <div className="flex gap-2">
              <span className="w-5 h-5 bg-gray-300 text-white rounded-full flex items-center justify-center flex-shrink-0 font-medium">2</span>
              <div><strong className="text-gray-700">Review & koreksi</strong><br/>Cek hasil parsing — edit operasi yang salah, tambah yang kurang, hapus yang tidak perlu.</div>
            </div>
            <div className="flex gap-2">
              <span className="w-5 h-5 bg-gray-300 text-white rounded-full flex items-center justify-center flex-shrink-0 font-medium">3</span>
              <div><strong className="text-gray-700">Simpan & assign</strong><br/>Simpan ke sistem lalu assign ke line produksi yang berjalan.</div>
            </div>
          </div>
        </div>
      )}

      {/* Model cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {models.map((m: any) => {
          const assigned = m.assignments ?? []
          return (
            <div key={m.id} className="card p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="font-semibold text-gray-900">{m.name}</div>
                  <div className="text-xs text-gray-400">{m.article} · {m.stage}</div>
                </div>
                <span className="badge badge-info">
                  Takt: {m.sections?.[0]?.taktTime ?? '—'}s
                </span>
              </div>
              <div className="flex flex-wrap gap-1 mb-3">
                {(m.sections ?? []).map((s: any) => (
                  <span key={s.name} className="badge badge-ok text-xs">{s.name}: {s.operations?.length ?? '?'} ops</span>
                ))}
              </div>
              {m.uploadedFrom && <div className="text-xs text-gray-400 mb-2">📁 {m.uploadedFrom}</div>}
              <div className="text-xs text-gray-500 mb-3">
                {assigned.length > 0
                  ? 'Aktif: ' + assigned.map((a: any) => `Gdg ${a.line.building} L${a.line.lineNo}`).join(', ')
                  : 'Belum diassign ke line manapun'}
              </div>
              <div className="flex gap-2 pt-2 border-t border-gray-50">
                <button onClick={() => loadModelForEdit(m.id)} className="text-xs text-teal hover:underline font-medium">✏ Edit model</button>
                <button onClick={() => deleteModel(m.id, m.name)} className="text-xs text-red-400 hover:text-red-600 hover:underline">Hapus</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Editor modal */}
      {editor && <ModelEditor draft={editor} onSave={saveModel} onCancel={() => { setEditor(null); setParseMsg('') }} />}
    </div>
  )
}