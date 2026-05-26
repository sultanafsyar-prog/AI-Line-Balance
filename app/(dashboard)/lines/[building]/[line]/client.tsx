'use client'
import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts'
import { calcSectionMetrics, isIE, LINE_TYPES, getGWT } from '@/lib/utils'
import Link from 'next/link'

interface Props {
  line: any
  allModels: any[]
  user: any
  sections: string[]
}

export default function LineDetailClient({ line, allModels, user, sections }: Props) {
  const [selSec, setSelSec] = useState(sections[sections.length > 1 ? sections.indexOf('Assembly') !== -1 ? sections.indexOf('Assembly') : 0 : 0])
  const [feat, setFeat] = useState<'yamazumi' | 'input' | 'monitor' | 'ai'>('yamazumi')
  const [inputF, setInputF] = useState({ output: '', mpActual: '', downtime: '0', dtReason: '', defect: '0', hour: String(new Date().getHours()) })
  const [saving, setSaving] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [assigning, setAssigning] = useState(false)

  const model = line.assignments[0]?.model
  const section = model?.sections.find((s: any) => s.name === selSec)
  const takt = section?.taktTime ?? 36
  const metrics = section ? calcSectionMetrics(section.operations, section.stdMP, takt) : null
  const tph = model ? LINE_TYPES[model.lineType as 'MINI' | 'BIG'].tph : 100

  const sectionActuals = line.actuals.filter((a: any) => a.section.name === selSec).sort((a: any, b: any) => a.hour - b.hour)
  const totOut = sectionActuals.reduce((s: number, a: any) => s + a.output, 0)
  const totDT  = sectionActuals.reduce((s: number, a: any) => s + a.downtime, 0)
  const totDef = sectionActuals.reduce((s: number, a: any) => s + a.defect, 0)
  const avgMP  = sectionActuals.length ? Math.round(sectionActuals.reduce((s: number, a: any) => s + a.mpActual, 0) / sectionActuals.length) : 0
  const avgOut = sectionActuals.length ? Math.round(totOut / sectionActuals.length) : 0
  const ller   = tph > 0 && sectionActuals.length ? parseFloat((avgOut / tph * 100).toFixed(1)) : 0

  async function saveActual() {
    if (!section || !inputF.output || !inputF.mpActual) return
    setSaving(true)
    await fetch('/api/actuals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lineId: line.id, sectionId: section.id,
        date: new Date().toISOString().slice(0, 10),
        hour: parseInt(inputF.hour),
        output: parseInt(inputF.output), mpActual: parseInt(inputF.mpActual),
        downtime: parseInt(inputF.downtime) || 0, dtReason: inputF.dtReason,
        defect: parseInt(inputF.defect) || 0,
      })
    })
    setSaving(false)
    setInputF(f => ({ ...f, output: '', mpActual: '', downtime: '0', dtReason: '', defect: '0' }))
    window.location.reload()
  }

  async function runAI() {
    setAiLoading(true); setAiText('')
    const res = await fetch('/api/analytics', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineId: line.id, sectionName: selSec })
    })
    const data = await res.json()
    setAiText(data.analysis ?? 'Tidak ada hasil.')
    setAiLoading(false)
  }

  async function assignModel(modelId: string | null) {
    await fetch('/api/lines', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineId: line.id, modelId })
    })
    setAssigning(false)
    window.location.reload()
  }

  const yamData = metrics?.rows.map(r => ({
    name: r.name.length > 14 ? r.name.slice(0, 14) + '…' : r.name,
    VA: r.va, NVAN: r.nvan, NVA: r.nva, gwt: r.gwt, isBn: r.gwt > takt,
  })) ?? []

  const feats = [
    { key: 'yamazumi', label: '📊 Yamazumi' },
    { key: 'input', label: '✎ Input aktual' },
    { key: 'monitor', label: '◉ Monitor' },
    { key: 'ai', label: '🤖 AI' },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-2 mb-1 text-sm text-gray-500">
        <Link href="/dashboard" className="hover:text-teal">Dashboard</Link>
        <span>/</span><span className="text-gray-900 font-medium">Gedung {line.building} — Line {line.lineNo}</span>
      </div>

      <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
        <div>
          {model ? (
            <p className="text-sm text-gray-500">
              Model: <strong className="text-gray-800">{model.name}</strong> · {model.article} ·
              <span className="text-teal"> {LINE_TYPES[model.lineType as 'MINI' | 'BIG'].label}</span> · Takt: {takt}s
            </p>
          ) : <p className="text-sm text-gray-400">Belum ada model</p>}
        </div>
        {isIE(user?.role) && (
          <button onClick={() => setAssigning(true)} className="btn btn-secondary text-xs">
            {model ? 'Ganti model' : 'Assign model'}
          </button>
        )}
      </div>

      {/* Alerts */}
      {line.alerts.length > 0 && (
        <div className="mb-4 space-y-1">
          {line.alerts.map((a: any) => (
            <div key={a.id} className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
              <span>⚠</span> {a.message}
            </div>
          ))}
        </div>
      )}

      {/* Section tabs */}
      <div className="flex flex-wrap gap-1 mb-4 pb-3 border-b border-gray-100">
        {sections.map(s => (
          <button key={s} onClick={() => setSelSec(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selSec === s ? 'bg-teal text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {s}
          </button>
        ))}
      </div>

      {!model ? (
        <div className="card p-12 text-center text-gray-400">
          {isIE(user?.role) ? 'Klik "Assign model" untuk set model ke line ini' : 'Hubungi tim IE untuk assign model'}
        </div>
      ) : (
        <>
          {/* Feature tabs */}
          <div className="flex gap-2 flex-wrap mb-4">
            {feats.map(f => (
              <button key={f.key} onClick={() => setFeat(f.key as any)}
                className={`btn ${feat === f.key ? 'btn-primary' : 'btn-secondary'} text-xs`}>
                {f.label}
              </button>
            ))}
          </div>

          {/* ── YAMAZUMI ── */}
          {feat === 'yamazumi' && metrics && (
            <div>
              {/* MP Gap Analysis */}
              {sectionActuals.length > 0 && (() => {
                const gap = parseFloat((avgMP - section.stdMP).toFixed(1))
                const pct = section.stdMP > 0 ? Math.round(avgMP / section.stdMP * 100) : 0
                return (
                  <div className={`mb-4 px-4 py-3 rounded-xl border text-sm flex items-center justify-between flex-wrap gap-3 ${gap >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                    <div>
                      <span className="font-medium text-gray-700">Analisis MP — </span>
                      <span className={`font-semibold ${gap >= 0 ? 'text-teal' : 'text-red-600'}`}>
                        {gap >= 0 ? `+${gap}` : gap} orang vs standar
                        {gap < -1 && ' ← kemungkinan penyebab output rendah!'}
                      </span>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>Std MP: <strong className="text-gray-700">{section.stdMP}</strong></span>
                      <span>Aktual avg: <strong className="text-gray-700">{avgMP}</strong></span>
                      <span>Efisiensi MP: <strong className={pct >= 95 ? 'text-teal' : pct >= 80 ? 'text-amber-600' : 'text-red-600'}>{pct}%</strong></span>
                    </div>
                  </div>
                )
              })()}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                  { l: 'Standard MP', v: section.stdMP + ' orang', c: '' },
                  { l: 'Theoretical MP', v: metrics.theorMP + ' orang', c: '' },
                  { l: 'LBR', v: metrics.lbr + '%', c: metrics.lbr >= 85 ? 'text-teal' : metrics.lbr >= 70 ? 'text-amber-600' : 'text-red-600' },
                  { l: 'Bottleneck', v: metrics.bottleneck.gwt + 's', c: metrics.bottleneck.gwt > takt ? 'text-red-600' : 'text-teal' },
                ].map(m => (
                  <div key={m.l} className="card p-3">
                    <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{m.l}</div>
                    <div className={`text-xl font-semibold ${m.c || 'text-gray-900'}`}>{m.v}</div>
                  </div>
                ))}
              </div>

              <div className="flex gap-4 mb-3 text-xs text-gray-500">
                {[['#1D9E75', 'VA'], ['#EF9F27', 'NVAN'], ['#E24B4A', 'NVA'], ['— merah', 'Takt time']].map(([c, l]) => (
                  <span key={l} className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-sm inline-block" style={{ background: c.startsWith('—') ? '#E24B4A' : c }} />
                    {l}
                  </span>
                ))}
              </div>

              <div className="card p-4 mb-4" style={{ height: Math.max(280, yamData.length * 24 + 100) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={yamData} margin={{ top: 10, right: 60, left: 0, bottom: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-40} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 10 }} label={{ value: 'Detik (s)', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }} />
                    <Tooltip formatter={(v: any, n: string) => [v + 's', n]} />
                    <ReferenceLine y={takt} stroke="#E24B4A" strokeWidth={2} strokeDasharray="5 4"
                      label={{ value: `TT=${takt}s`, fill: '#E24B4A', fontSize: 10, position: 'right' }} />
                    <Bar dataKey="VA" stackId="s" fill="#1D9E75" maxBarSize={40} />
                    <Bar dataKey="NVAN" stackId="s" fill="#EF9F27" maxBarSize={40} />
                    <Bar dataKey="NVA" stackId="s" fill="#E24B4A" maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>{['#', 'Operasi', 'VA(s)', 'NVAN(s)', 'NVA(s)', 'GWT(s)', 'vs TT', 'Status'].map(h =>
                      <th key={h} className="text-left px-3 py-2 text-xs text-gray-500 font-medium uppercase tracking-wide">{h}</th>
                    )}</tr>
                  </thead>
                  <tbody>
                    {metrics.rows.map((r: any, i: number) => {
                      const isBn = r.gwt > takt, isHi = !isBn && r.gwt > takt * 0.85
                      const diff = parseFloat((r.gwt - takt).toFixed(2))
                      return (
                        <tr key={r.id} className={`border-b border-gray-50 ${isBn ? 'bg-red-50' : isHi ? 'bg-amber-50' : ''}`}>
                          <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                          <td className="px-3 py-2 text-gray-800">{r.name}</td>
                          <td className="px-3 py-2 text-teal text-xs">{r.va}</td>
                          <td className="px-3 py-2 text-amber-600 text-xs">{r.nvan || '—'}</td>
                          <td className="px-3 py-2 text-red-500 text-xs">{r.nva || '—'}</td>
                          <td className={`px-3 py-2 font-medium text-xs ${isBn ? 'text-red-600' : isHi ? 'text-amber-600' : 'text-gray-900'}`}>{r.gwt}</td>
                          <td className={`px-3 py-2 text-xs ${diff > 0 ? 'text-red-600' : 'text-teal'}`}>{diff > 0 ? '+' : ''}{diff}s</td>
                          <td className="px-3 py-2">
                            <span className={`badge ${isBn ? 'badge-bad' : isHi ? 'badge-warn' : 'badge-ok'}`}>
                              {isBn ? 'Bottleneck' : isHi ? 'Review' : 'Normal'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── INPUT AKTUAL ── */}
          {feat === 'input' && (
            <div>
              <div className="card p-5 max-w-lg mb-5">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="label">Jam ke-</label>
                    <select className="input" value={inputF.hour} onChange={e => setInputF(f => ({ ...f, hour: e.target.value }))}>
                      {Array.from({ length: 12 }, (_, i) => i + 7).map(h =>
                        <option key={h} value={h}>{h}:00 – {h + 1}:00</option>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="label">Output aktual (pairs)</label>
                    <input type="number" min="0" className="input" placeholder={`Target: ${tph}`}
                      value={inputF.output} onChange={e => setInputF(f => ({ ...f, output: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">MP hadir (orang)</label>
                    <input type="number" min="0" className="input" placeholder={`Std: ${section?.stdMP}`}
                      value={inputF.mpActual} onChange={e => setInputF(f => ({ ...f, mpActual: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Downtime (menit)</label>
                    <input type="number" min="0" className="input"
                      value={inputF.downtime} onChange={e => setInputF(f => ({ ...f, downtime: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Defect (pairs)</label>
                    <input type="number" min="0" className="input"
                      value={inputF.defect} onChange={e => setInputF(f => ({ ...f, defect: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Alasan downtime</label>
                    <select className="input" value={inputF.dtReason} onChange={e => setInputF(f => ({ ...f, dtReason: e.target.value }))}>
                      <option value="">— Pilih —</option>
                      {['Mesin rusak', 'Material kurang', 'Style change', 'QC hold', 'Operator kurang', 'Lainnya'].map(r =>
                        <option key={r} value={r}>{r}</option>
                      )}
                    </select>
                  </div>
                </div>
                <button onClick={saveActual} disabled={saving} className="btn btn-primary">
                  {saving ? 'Menyimpan...' : '✓ Simpan data'}
                </button>
              </div>

              {sectionActuals.length > 0 && (
                <div className="card overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-50 text-sm font-medium text-gray-700">Log hari ini</div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50"><tr>
                      {['Jam', 'Output', 'vs Target', 'MP', 'DT (mnt)', 'Defect', 'Keterangan'].map(h =>
                        <th key={h} className="text-left px-3 py-2 text-xs text-gray-500 font-medium">{h}</th>
                      )}
                    </tr></thead>
                    <tbody>
                      {sectionActuals.map((a: any) => {
                        const gap = a.output - tph
                        return (
                          <tr key={a.id} className="border-t border-gray-50">
                            <td className="px-3 py-2">{a.hour}:00</td>
                            <td className="px-3 py-2 font-medium">{a.output}</td>
                            <td className={`px-3 py-2 font-medium text-xs ${gap >= 0 ? 'text-teal' : 'text-red-600'}`}>{gap >= 0 ? '+' : ''}{gap}</td>
                            <td className="px-3 py-2">{a.mpActual}</td>
                            <td className={`px-3 py-2 text-xs ${a.downtime > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{a.downtime || '—'}</td>
                            <td className={`px-3 py-2 text-xs ${a.defect > 0 ? 'text-red-500' : 'text-gray-400'}`}>{a.defect || '—'}</td>
                            <td className="px-3 py-2 text-xs text-gray-400">{a.dtReason || '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── MONITOR ── */}
          {feat === 'monitor' && (
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                  { l: 'Output hari ini', v: totOut + ' pairs', s: `Target: ${sectionActuals.length * tph} pairs`, c: '' },
                  { l: 'Avg MP hadir', v: avgMP + ' orang', s: `Std: ${section?.stdMP}`, c: '' },
                  { l: 'LLER', v: ller + '%', s: '', c: ller >= 85 ? 'text-teal' : ller >= 70 ? 'text-amber-600' : 'text-red-600' },
                  { l: 'Total defect', v: totDef + ' pairs', s: totOut > 0 ? (totDef / totOut * 100).toFixed(2) + '%' : '', c: '' },
                ].map(m => (
                  <div key={m.l} className="card p-3">
                    <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{m.l}</div>
                    <div className={`text-2xl font-semibold ${m.c || 'text-gray-900'}`}>{m.v}</div>
                    {m.s && <div className="text-xs text-gray-400 mt-1">{m.s}</div>}
                  </div>
                ))}
              </div>

              {sectionActuals.length === 0 ? (
                <div className="card p-12 text-center text-gray-400 text-sm">Belum ada data aktual section {selSec} hari ini</div>
              ) : (
                <div className="card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100"><tr>
                      {['Jam', 'Output', 'vs Target', 'MP', 'Efisiensi MP', 'Downtime', 'Defect%'].map(h =>
                        <th key={h} className="text-left px-3 py-2 text-xs text-gray-500 font-medium">{h}</th>
                      )}
                    </tr></thead>
                    <tbody>
                      {sectionActuals.map((a: any) => {
                        const gap = a.output - tph
                        const mpEff = section && a.mpActual > 0 ? parseFloat((a.output / a.mpActual / (tph / section.stdMP) * 100).toFixed(0)) : 0
                        return (
                          <tr key={a.id} className="border-t border-gray-50">
                            <td className="px-3 py-2">{a.hour}:00</td>
                            <td className="px-3 py-2 font-medium">{a.output}</td>
                            <td className={`px-3 py-2 font-medium text-xs ${gap >= 0 ? 'text-teal' : 'text-red-600'}`}>{gap >= 0 ? '+' : ''}{gap}</td>
                            <td className="px-3 py-2">{a.mpActual}</td>
                            <td className={`px-3 py-2 text-xs ${mpEff >= 85 ? 'text-teal' : mpEff >= 70 ? 'text-amber-600' : 'text-red-600'}`}>{mpEff}%</td>
                            <td className={`px-3 py-2 text-xs ${a.downtime > 10 ? 'text-red-500' : a.downtime > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{a.downtime ? a.downtime + 'm' : '—'}{a.dtReason ? ` (${a.dtReason})` : ''}</td>
                            <td className={`px-3 py-2 text-xs ${a.defect > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{a.output ? (a.defect / a.output * 100).toFixed(2) + '%' : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── AI ── */}
          {feat === 'ai' && (
            <div className="card p-5">
              {!aiText && !aiLoading && (
                <div className="text-center py-8">
                  <div className="text-4xl mb-3">🤖</div>
                  <div className="font-medium mb-2">Analisis AI — {selSec}</div>
                  <p className="text-sm text-gray-500 mb-4">AI baca standar IE + aktual hari ini → rekomendasi bottleneck & redistribusi MP</p>
                  <button onClick={runAI} className="btn btn-primary">Jalankan analisis AI ↗</button>
                </div>
              )}
              {aiLoading && <div className="text-center py-8 text-gray-500 text-sm">🤖 AI sedang menganalisis lini...</div>}
              {aiText && (
                <div>
                  <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap text-sm">{aiText}</div>
                  <button onClick={runAI} className="btn btn-secondary mt-4 text-xs">↺ Analisis ulang</button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Assign modal */}
      {assigning && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setAssigning(false)}>
          <div className="bg-white rounded-xl p-5 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="font-semibold mb-3">Assign model — Gedung {line.building} Line {line.lineNo}</div>
            <div className="space-y-2 mb-4 max-h-64 overflow-auto">
              <div onClick={() => assignModel(null)} className="px-3 py-2.5 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 text-sm">
                — Hapus assign —
              </div>
              {allModels.map((m: any) => (
                <div key={m.id} onClick={() => assignModel(m.id)}
                  className={`px-3 py-2.5 border rounded-lg cursor-pointer text-sm ${model?.id === m.id ? 'border-teal bg-teal-light' : 'border-gray-200 hover:bg-gray-50'}`}>
                  <div className="font-medium">{m.name} · {m.article}</div>
                  <div className="text-xs text-gray-400">{LINE_TYPES[m.lineType as 'MINI' | 'BIG'].label}</div>
                </div>
              ))}
            </div>
            <button onClick={() => setAssigning(false)} className="btn btn-secondary w-full justify-center">Batal</button>
          </div>
        </div>
      )}
    </div>
  )
}