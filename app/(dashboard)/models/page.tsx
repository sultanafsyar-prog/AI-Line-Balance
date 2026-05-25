'use client'
import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import { LINE_TYPES, SECTIONS, SF_SECTIONS } from '@/lib/utils'
import Link from 'next/link'

// ─── TYPES ───────────────────────────────────────────────────
type Op = { id: string; name: string; va: number; nvan: number; nva: number; mcCT: number; allowance: number }
type Sec = { name: string; stdMP: number; taktTime: number; ops: Op[] }
type ModelDraft = { name: string; article: string; stage: string; lineType: 'MINI' | 'BIG'; sections: Sec[] }

const ALL_SECTIONS = [...SECTIONS, 'Stockfit']
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

  // Helper: scan satu row, ambil nilai string pertama yang cocok keyword
  function scanRow(row: any[], ...keywords: string[]) {
    const flat = row.map((v: any) => String(v ?? '').trim())
    for (const kw of keywords) {
      const idx = flat.findIndex(v => v.toLowerCase().includes(kw.toLowerCase()))
      if (idx !== -1) {
        // Cari nilai non-kosong setelah keyword di kolom berikutnya
        for (let c = idx + 1; c < flat.length; c++) {
          if (flat[c] && flat[c] !== '0') return flat[c]
        }
      }
    }
    return ''
  }

  // ── 1. LINE BALANCING RESUME ──────────────────────────────
  const rws = wb.Sheets['LINE BALANCING RESUME']
  if (rws) {
    const rd: any[][] = XLSX.utils.sheet_to_json(rws, { header: 1, defval: '' })
    const secMPs: Record<string, number> = {}

    for (const row of rd) {
      const flat = row.map((v: any) => String(v ?? '').trim())
      const full = flat.join('|').toLowerCase()

      if (full.includes('takt time')) {
        const v = parseFloat(scanRow(row, 'takt', 'time') || flat.find((s, i) => i > 0 && /^\d+\.?\d*$/.test(s) && parseFloat(s) < 200) || '36')
        if (!isNaN(v) && v > 0) { draft.sections.forEach(s => { if (s.name !== 'Stockfit') s.taktTime = v }); draft.lineType = v <= 22 ? 'BIG' : 'MINI' }
      }
      if (full.includes('item/model') || full.includes('model/article')) {
        const v = scanRow(row, 'model', 'article', 'item')
        if (v) { draft.name = v; draft.article = 'U-' + v }
      }
      if (full.includes('stage') && !full.includes('section') && !full.includes('total')) {
        const v = scanRow(row, 'stage')
        if (v && v.length > 2) draft.stage = v
      }

      // Section stdMP: cari baris yang ada nama section + angka IE Std Labor
      const sectionMatch = ALL_SECTIONS.find(s => {
        const secLower = s.toLowerCase()
        return flat.some(v => v.toLowerCase() === secLower || v.toLowerCase().includes(secLower))
      })
      if (sectionMatch) {
        // Kolom IE Standard Labor biasanya kolom ke-5 atau ke-4 (0-indexed)
        const mp = parseFloat(row[5]) || parseFloat(row[4]) || parseFloat(row[6])
        if (!isNaN(mp) && mp > 0) secMPs[sectionMatch] = mp
        // Juga coba "Stitching" → "Sewing"
        if (flat.some(v => v.toLowerCase() === 'stitching')) {
          const mp2 = parseFloat(row[5]) || parseFloat(row[4])
          if (!isNaN(mp2) && mp2 > 0) secMPs['Sewing'] = mp2
        }
        if (flat.some(v => v.toLowerCase() === 'stockfitting')) {
          const mp2 = parseFloat(row[5]) || parseFloat(row[4])
          if (!isNaN(mp2) && mp2 > 0) secMPs['Stockfit'] = mp2
        }
      }
    }

    // Apply stdMP ke sections
    draft.sections.forEach(s => { if (secMPs[s.name]) s.stdMP = secMPs[s.name] })
  }

  // ── 2. LB SHEETS ─────────────────────────────────────────
  // Map nama sheet → nama section di sistem kita
  const sheetMap: Array<{ patterns: string[]; sec: string; mpKey?: string }> = [
    { patterns: ['lb cutting', 'cutting in line', 'lb cut'], sec: 'Cutting' },
    { patterns: ['lb prep', 'preparation'], sec: 'Preparation' },
    { patterns: ['lb pc sewing', 'pc sewing'], sec: 'PC Sewing' },
    { patterns: ['lb sewing', 'stitching', 'lb stitch'], sec: 'Sewing' },
    { patterns: ['lb  assembly', 'lb assembly', 'assembly'], sec: 'Assembly' },
    { patterns: ['lb stockfit', 'stockfit'], sec: 'Stockfit' },
    { patterns: ['treatment', 'lb treat'], sec: 'Treatment' },
    { patterns: ['packing', 'lb pack'], sec: 'Packing' },
  ]

  for (const sheetName of wb.SheetNames) {
    const nameLower = sheetName.toLowerCase().trim()
    const cfg = sheetMap.find(c => c.patterns.some(p => nameLower.includes(p)))
    if (!cfg) continue

    const ws = wb.Sheets[sheetName]
    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

    // Ambil takt time & stdMP dari header sheet (row 4)
    const r4 = data[3] ?? []
    const sheetTakt = parseFloat(r4[8]) || parseFloat(r4[7]) || parseFloat(r4[6])
    const sheetStdMP = parseFloat(r4[9]) || parseFloat(r4[16]) || 0

    const sec = draft.sections.find(s => s.name === cfg.sec)
    if (!sec) continue
    if (!isNaN(sheetTakt) && sheetTakt > 0) sec.taktTime = sheetTakt
    if (sheetStdMP > 0 && sec.stdMP === 0) sec.stdMP = sheetStdMP

    // ── Cari baris header operasi ─────────────────────────
    // Cari baris yang ada "VA" dan "NVAN" atau "Operation Name"
    let headerRow = -1
    let colMap = { pno: 1, name: 2, va: 8, nvan: 9, nva: 10, mcCT: 11, overlap: 12, al: 13 }

    for (let i = 4; i < Math.min(data.length, 15); i++) {
      const flat = data[i].map((v: any) => String(v ?? '').trim().toLowerCase())
      if (flat.some(v => v.includes('va') || v.includes('operation') || v.includes('operasi'))) {
        headerRow = i
        // Auto-detect column positions
        flat.forEach((v, ci) => {
          if (v === 'va' || v === 'va ') colMap.va = ci
          if (v.includes('nvan') && !v.includes('nva')) colMap.nvan = ci
          if (v === 'nva' || v === 'nva ') colMap.nva = ci
          if (v.includes('m/c') || v.includes('machine')) colMap.mcCT = ci
          if (v.includes('allowance')) colMap.al = ci
        })
        break
      }
    }

    // Baca operasi mulai dari baris setelah header (atau row 11 default)
    const startRow = headerRow > 0 ? headerRow + 2 : 10

    for (let i = startRow; i < data.length; i++) {
      const r = data[i]
      const pno = String(r[colMap.pno] ?? '').trim()
      const opName = String(r[colMap.name] ?? '').trim()

      if (!pno || isNaN(parseInt(pno))) continue
      if (!opName || opName.toLowerCase().includes('total') || opName.toLowerCase().includes('subtotal')) continue

      const va   = parseFloat(r[colMap.va])   || 0
      const nvan = parseFloat(r[colMap.nvan]) || 0
      const nva  = parseFloat(r[colMap.nva])  || 0
      const mcCT = parseFloat(r[colMap.mcCT]) || 0
      const al   = parseFloat(r[colMap.al])   || 0.15
      const gwt  = va + nvan + nva

      // Skip baris kosong
      if (gwt === 0 && mcCT === 0) continue

      sec.ops.push({
        id: Math.random().toString(36).slice(2),
        name: opName,
        va, nvan, nva, mcCT,
        allowance: al > 1 ? al / 100 : al, // normalize: 15 → 0.15
      })
    }
  }

  // Fallback: ambil model name dari LB sheet jika RESUME gagal
  if (!draft.name) {
    for (const sn of wb.SheetNames) {
      const ws = wb.Sheets[sn]
      const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
      const r4 = data[3] ?? []
      const modelNo = String(r4[2] ?? '').trim()
      const artPfx  = String(r4[4] ?? '').trim()
      if (modelNo && !isNaN(parseInt(modelNo))) {
        draft.name    = (artPfx || '') + modelNo
        draft.article = (artPfx || 'U') + '-' + modelNo
        break
      }
    }
  }

  return draft
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
            <div>
              <label className="label">Line type</label>
              <select className="input text-sm" value={draft.lineType} onChange={e => updModel('lineType', e.target.value as any)}>
                <option value="MINI">Mini Line (100 pairs/jam, TT 36s)</option>
                <option value="BIG">Big Line (180 pairs/jam, TT 20s)</option>
              </select>
            </div>
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
    fetch('/api/models').then(r => r.json()).then(d => { setModels(d); setLoading(false) })
  }, [])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setParseError(''); setParseMsg('')
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const draft = parseNBStandard(ev.target!.result as ArrayBuffer)
        const filledSecs = draft.sections.filter(s => s.ops.length > 0)
        const totalOps = filledSecs.reduce((sum, s) => sum + s.ops.length, 0)
        setParseMsg(`Berhasil membaca ${filledSecs.length} section, ${totalOps} operasi${!draft.name ? ' — nama model tidak terbaca, isi manual' : ''}`)
        setEditor(draft)
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
                <span className={`badge ${m.lineType === 'BIG' ? 'badge-info' : 'badge-ok'}`}>
                  {LINE_TYPES[m.lineType as 'MINI' | 'BIG'].label}
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
