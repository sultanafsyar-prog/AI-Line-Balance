'use client'
import { useState, useEffect } from 'react'
import { BUILDINGS, LINE_TYPES } from '@/lib/utils'

type Line = { id: string; building: string; lineNo: number; model: { name: string; lineType: string } | null; sections: { id: string; name: string; stdMP: number; taktTime: number }[] }

const DT_REASONS = ['Mesin rusak', 'Material kurang', 'Style change', 'QC hold', 'Operator kurang', 'Lainnya']
const SHIFT_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
const OT_HOURS    = [17, 18, 19]

export default function InputPage() {
  const [lines, setLines]   = useState<Line[]>([])
  const [loading, setLoading] = useState(true)
  const [selBuilding, setSelBuilding] = useState('')
  const [selLineId, setSelLineId]     = useState('')
  const [selSecId, setSelSecId]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')

  const [form, setForm] = useState({
    hour: String(new Date().getHours()),
    output: '', mpActual: '', downtime: '0', dtReason: '', defect: '0',
  })

  useEffect(() => {
    fetch('/api/lines').then(r => r.json()).then((data: any[]) => {
      // Ambil model + sections dari line
      const mapped: Line[] = data.map(l => ({
        id: l.id, building: l.building, lineNo: l.lineNo,
        model: l.assignments?.[0]?.model ?? null,
        sections: l.assignments?.[0]?.model?.sections ?? [],
      }))
      setLines(mapped)
      setLoading(false)
    })
  }, [])

  const buildings = [...new Set(lines.map(l => l.building))].sort()
  const filteredLines = lines.filter(l => l.building === selBuilding && l.model)
  const selLine  = lines.find(l => l.id === selLineId)
  const selSec   = selLine?.sections.find(s => s.id === selSecId)
  const tph      = selLine?.model ? LINE_TYPES[selLine.model.lineType as 'MINI' | 'BIG'].tph : 0

  // Auto-select first building with lines that have model
  useEffect(() => {
    if (!selBuilding && buildings.length > 0) {
      const first = buildings.find(b => lines.some(l => l.building === b && l.model))
      if (first) setSelBuilding(first)
    }
  }, [buildings, lines, selBuilding])

  // Auto-select first line when building changes
  useEffect(() => {
    if (selBuilding) {
      const fl = filteredLines[0]
      setSelLineId(fl?.id ?? '')
      setSelSecId(fl?.sections[0]?.id ?? '')
    }
  }, [selBuilding])

  // Auto-select first section when line changes
  useEffect(() => {
    if (selLineId) {
      const sl = lines.find(l => l.id === selLineId)
      setSelSecId(sl?.sections[0]?.id ?? '')
    }
  }, [selLineId])

  async function handleSubmit() {
    if (!selLineId || !selSecId || !form.output || !form.mpActual) {
      setError('Pilih line, section, dan isi output serta MP hadir')
      return
    }
    setSaving(true); setError(''); setSaved(false)
    const res = await fetch('/api/actuals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lineId: selLineId, sectionId: selSecId,
        date: new Date().toISOString().slice(0, 10),
        hour: parseInt(form.hour),
        output: parseInt(form.output),
        mpActual: parseInt(form.mpActual),
        downtime: parseInt(form.downtime) || 0,
        dtReason: form.dtReason,
        defect: parseInt(form.defect) || 0,
      }),
    })
    if (res.ok) {
      setSaved(true)
      setForm(f => ({ ...f, output: '', mpActual: '', downtime: '0', dtReason: '', defect: '0' }))
      setTimeout(() => setSaved(false), 3000)
    } else {
      setError('Gagal menyimpan, coba lagi')
    }
    setSaving(false)
  }

  if (loading) return <div className="text-gray-400 text-sm p-8">Memuat data lini...</div>

  const outputNum = parseInt(form.output) || 0
  const gap = tph > 0 && outputNum > 0 ? outputNum - tph : null

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-gray-900">Input aktual</h1>
        <p className="text-sm text-gray-500 mt-1">
          {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Step 1 - Pilih lokasi */}
      <div className="card p-4 mb-3">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          1 — Pilih lokasi
        </div>
        <div className="space-y-3">
          {/* Gedung */}
          <div>
            <label className="label">Gedung</label>
            <div className="flex flex-wrap gap-2">
              {buildings.map(b => (
                <button key={b} onClick={() => setSelBuilding(b)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                    selBuilding === b ? 'bg-teal text-white border-teal' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}>
                  {b === 'G' ? 'G (Stockfit)' : `Gdg ${b}`}
                </button>
              ))}
            </div>
          </div>

          {/* Line */}
          {selBuilding && (
            <div>
              <label className="label">Line</label>
              {filteredLines.length === 0 ? (
                <p className="text-sm text-amber-600">Belum ada line dengan model aktif di Gedung {selBuilding}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {filteredLines.map(l => (
                    <button key={l.id} onClick={() => setSelLineId(l.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                        selLineId === l.id ? 'bg-teal text-white border-teal' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}>
                      Line {l.lineNo}
                      {l.model && <span className="text-xs opacity-75 ml-1">({l.model.name})</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Section */}
          {selLineId && selLine?.sections && selLine.sections.length > 0 && (
            <div>
              <label className="label">Section</label>
              <div className="flex flex-wrap gap-2">
                {selLine.sections.map(s => (
                  <button key={s.id} onClick={() => setSelSecId(s.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                      selSecId === s.id ? 'bg-teal text-white border-teal' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Selected info */}
      {selLine && selSec && (
        <div className="px-4 py-2 bg-teal-light border border-teal rounded-lg text-sm text-teal-dark mb-3 flex items-center justify-between">
          <span>
            <strong>Gdg {selLine.building} Line {selLine.lineNo}</strong> · {selSec.name}
          </span>
          <span className="text-xs">Target: {tph} pairs/jam · TT: {selSec.taktTime}s</span>
        </div>
      )}

      {/* Step 2 - Input data */}
      {selLineId && selSecId && (
        <div className="card p-4 mb-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            2 — Data jam ini
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label">Jam ke-</label>
              <select className="input" value={form.hour} onChange={e => setForm(f => ({ ...f, hour: e.target.value }))}>
                {[...SHIFT_HOURS, ...OT_HOURS].map(h => <option key={h} value={h}>{h}:00 – {h+1}:00</option>)}
              </select>
            </div>
            <div>
              <label className="label">Output (pairs) *</label>
              <input type="number" min="0" className="input text-lg font-semibold" placeholder={`Target: ${tph}`}
                value={form.output} onChange={e => setForm(f => ({ ...f, output: e.target.value }))} />
              {gap !== null && (
                <p className={`text-xs mt-1 font-medium ${gap >= 0 ? 'text-teal' : 'text-red-600'}`}>
                  {gap >= 0 ? `+${gap} dari target` : `${gap} dari target`}
                </p>
              )}
            </div>
            <div>
              <label className="label">MP hadir (orang) *</label>
              <input type="number" min="0" className="input" placeholder={`Std: ${selSec?.stdMP}`}
                value={form.mpActual} onChange={e => setForm(f => ({ ...f, mpActual: e.target.value }))} />
            </div>
            <div>
              <label className="label">Defect (pairs)</label>
              <input type="number" min="0" className="input"
                value={form.defect} onChange={e => setForm(f => ({ ...f, defect: e.target.value }))} />
            </div>
            <div>
              <label className="label">Downtime (menit)</label>
              <input type="number" min="0" className="input"
                value={form.downtime} onChange={e => setForm(f => ({ ...f, downtime: e.target.value }))} />
            </div>
            <div>
              <label className="label">Alasan downtime</label>
              <select className="input" value={form.dtReason} onChange={e => setForm(f => ({ ...f, dtReason: e.target.value }))}>
                <option value="">— Pilih —</option>
                {DT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          {error && (
            <div className="mb-3 px-3 py-2 bg-red-50 text-red-700 text-sm rounded-lg">⚠ {error}</div>
          )}
          {saved && (
            <div className="mb-3 px-3 py-2 bg-teal-light text-teal-dark text-sm rounded-lg font-medium">
              ✓ Data jam {form.hour}:00 berhasil disimpan!
            </div>
          )}

          <button onClick={handleSubmit} disabled={saving}
            className="btn btn-primary w-full justify-center text-base py-3">
            {saving ? 'Menyimpan...' : `✓ Simpan data jam ${form.hour}:00`}
          </button>
        </div>
      )}

      {!selLineId && !loading && (
        <div className="card p-8 text-center text-gray-400 text-sm">
          Pilih gedung dan line untuk mulai input data
        </div>
      )}
    </div>
  )
}