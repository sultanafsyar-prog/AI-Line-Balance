'use client'
import { useState } from 'react'
import { LINE_TYPES, SECTIONS, SF_SECTIONS } from '@/lib/utils'

const DT_REASONS = ['Mesin rusak', 'Material kurang', 'Style change', 'QC hold', 'Operator kurang', 'Lainnya']
const HOURS = Array.from({ length: 12 }, (_, i) => i + 7)

interface Props {
  lines: any[]
  userId: string
  userName: string
}

export default function LeaderClient({ lines, userId, userName }: Props) {
  const [selLineId, setSelLineId] = useState<string>(lines[0]?.id ?? '')
  const [selSec, setSelSec]       = useState('Assembly')
  const [view, setView]           = useState<'input' | 'status' | 'std'>('input')
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [error, setError]         = useState('')

  const nowHour = new Date().getHours()
  const [form, setForm] = useState({
    hour: String(nowHour >= 7 ? nowHour : 7),
    output: '', mpActual: '', downtime: '0', dtReason: '', defect: '0',
  })

  const line    = lines.find(l => l.id === selLineId)
  const model   = line?.assignments?.[0]?.model
  const sections = line?.building === 'G' ? SF_SECTIONS : SECTIONS
  const section  = model?.sections?.find((s: any) => s.name === selSec)
  const tph      = model ? LINE_TYPES[model.lineType as 'MINI' | 'BIG'].tph : 100
  const takt     = section?.taktTime ?? LINE_TYPES[model?.lineType as 'MINI' | 'BIG']?.takt ?? 36
  const todayActs = (line?.actuals ?? []).filter((a: any) => a.section?.name === selSec)
    .sort((a: any, b: any) => b.hour - a.hour)

  const totalOut  = todayActs.reduce((s: number, a: any) => s + a.output, 0)
  const lastOut   = todayActs[0]?.output ?? 0
  const lastLler  = tph > 0 ? Math.round(lastOut / tph * 100) : 0
  const outputNum = parseInt(form.output) || 0
  const gap       = outputNum > 0 ? outputNum - tph : null

  async function handleSave() {
    if (!selLineId || !section || !form.output || !form.mpActual) {
      setError('Output dan MP hadir wajib diisi'); return
    }
    setSaving(true); setError(''); setSaved(false)
    const res = await fetch('/api/actuals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lineId: selLineId, sectionId: section.id,
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
      setTimeout(() => { setSaved(false); window.location.reload() }, 1500)
    } else {
      setError('Gagal simpan, coba lagi')
    }
    setSaving(false)
  }

  return (
    <div className="max-w-md mx-auto pb-8">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Halo, {userName} 👋</h1>
        <p className="text-sm text-gray-500">
          {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {lines.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">
          <div className="text-4xl mb-3">⚠️</div>
          <div className="font-medium mb-1">Belum ada line yang di-assign</div>
          <p className="text-sm">Hubungi tim IE untuk assign line ke akun kamu</p>
        </div>
      ) : (
        <>
          {/* Pilih line */}
          {lines.length > 1 && (
            <div className="card p-3 mb-3">
              <label className="label">Line kamu</label>
              <div className="flex flex-wrap gap-2">
                {lines.map(l => (
                  <button key={l.id} onClick={() => setSelLineId(l.id)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      selLineId === l.id ? 'bg-teal text-white border-teal' : 'bg-gray-50 text-gray-600 border-gray-200'
                    }`}>
                    Gdg {l.building} — Line {l.lineNo}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Info line aktif */}
          {line && (
            <div className={`rounded-xl p-3 mb-3 ${model ? 'bg-teal-light' : 'bg-amber-50'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-gray-900">
                    Gedung {line.building} — Line {line.lineNo}
                  </div>
                  {model ? (
                    <div className="text-sm text-teal-dark">
                      {model.name} · {LINE_TYPES[model.lineType as 'MINI' | 'BIG'].label} · Target {tph} pairs/jam
                    </div>
                  ) : (
                    <div className="text-sm text-amber-700">Belum ada model — hubungi tim IE</div>
                  )}
                </div>
                {model && lastOut > 0 && (
                  <div className="text-right">
                    <div className={`text-2xl font-bold ${lastLler >= 90 ? 'text-teal' : lastLler >= 75 ? 'text-amber-600' : 'text-red-600'}`}>
                      {lastLler}%
                    </div>
                    <div className="text-xs text-gray-500">LLER jam terakhir</div>
                  </div>
                )}
              </div>

              {/* Alert */}
              {line.alerts?.length > 0 && (
                <div className="mt-2 pt-2 border-t border-amber-200">
                  {line.alerts.slice(0, 2).map((a: any) => (
                    <div key={a.id} className="text-xs text-red-700 flex items-center gap-1">
                      <span>⚠</span> {a.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {model && (
            <>
              {/* Tab navigator */}
              <div className="flex gap-1 mb-3 bg-gray-100 p-1 rounded-xl">
                {[
                  ['input', '✎ Input'],
                  ['status', '◉ Status'],
                  ['std', '📋 Standar'],
                ].map(([v, l]) => (
                  <button key={v} onClick={() => setView(v as any)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                      view === v ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                    }`}>
                    {l}
                  </button>
                ))}
              </div>

              {/* Section pills */}
              <div className="flex flex-wrap gap-1 mb-3">
                {sections.map(s => (
                  <button key={s} onClick={() => setSelSec(s)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      selSec === s ? 'bg-teal text-white border-teal' : 'bg-white text-gray-500 border-gray-200'
                    }`}>
                    {s}
                  </button>
                ))}
              </div>

              {/* ── INPUT VIEW ── */}
              {view === 'input' && (
                <div className="card p-4">
                  <div className="text-sm font-semibold text-gray-700 mb-3">
                    Input aktual — {selSec}
                  </div>

                  {/* Jam */}
                  <div className="mb-3">
                    <label className="label">Jam ke-</label>
                    <div className="flex flex-wrap gap-1">
                      {HOURS.map(h => (
                        <button key={h} onClick={() => setForm(f => ({ ...f, hour: String(h) }))}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            form.hour === String(h) ? 'bg-teal text-white border-teal' : 'bg-gray-50 text-gray-600 border-gray-200'
                          }`}>
                          {h}:00
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="label">Output (pairs) *</label>
                      <input type="number" inputMode="numeric" min="0"
                        className="input text-xl font-bold text-center"
                        placeholder={`Target: ${tph}`}
                        value={form.output}
                        onChange={e => setForm(f => ({ ...f, output: e.target.value }))} />
                      {gap !== null && (
                        <p className={`text-xs mt-1 font-semibold text-center ${gap >= 0 ? 'text-teal' : 'text-red-600'}`}>
                          {gap >= 0 ? `+${gap}` : gap} dari target
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="label">MP hadir *</label>
                      <input type="number" inputMode="numeric" min="0"
                        className="input text-xl font-bold text-center"
                        placeholder={`Std: ${section?.stdMP ?? '—'}`}
                        value={form.mpActual}
                        onChange={e => setForm(f => ({ ...f, mpActual: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">Downtime (mnt)</label>
                      <input type="number" inputMode="numeric" min="0"
                        className="input text-center"
                        value={form.downtime}
                        onChange={e => setForm(f => ({ ...f, downtime: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">Defect (pairs)</label>
                      <input type="number" inputMode="numeric" min="0"
                        className="input text-center"
                        value={form.defect}
                        onChange={e => setForm(f => ({ ...f, defect: e.target.value }))} />
                    </div>
                    {parseInt(form.downtime) > 0 && (
                      <div className="col-span-2">
                        <label className="label">Alasan downtime</label>
                        <select className="input" value={form.dtReason} onChange={e => setForm(f => ({ ...f, dtReason: e.target.value }))}>
                          <option value="">— Pilih alasan —</option>
                          {DT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    )}
                  </div>

                  {error && <div className="mb-3 px-3 py-2 bg-red-50 text-red-700 text-sm rounded-lg">⚠ {error}</div>}
                  {saved && <div className="mb-3 px-3 py-2 bg-teal-light text-teal-dark text-sm rounded-lg font-medium">✓ Data berhasil disimpan!</div>}

                  <button onClick={handleSave} disabled={saving}
                    className="btn btn-primary w-full justify-center text-base py-3">
                    {saving ? 'Menyimpan...' : `✓ Simpan jam ${form.hour}:00`}
                  </button>
                </div>
              )}

              {/* ── STATUS VIEW ── */}
              {view === 'status' && (
                <div className="space-y-3">
                  {/* Summary hari ini */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Total output', value: totalOut + ' pairs', color: '' },
                      { label: 'Jam input', value: todayActs.length + ' jam', color: '' },
                      { label: 'LLER terakhir', value: lastLler + '%', color: lastLler >= 90 ? 'text-teal' : lastLler >= 75 ? 'text-amber-600' : 'text-red-600' },
                    ].map(m => (
                      <div key={m.label} className="card p-3 text-center">
                        <div className={`text-xl font-bold ${m.color || 'text-gray-900'}`}>{m.value}</div>
                        <div className="text-xs text-gray-400 mt-1">{m.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Log per jam */}
                  {todayActs.length === 0 ? (
                    <div className="card p-8 text-center text-gray-400 text-sm">
                      Belum ada data input hari ini untuk section {selSec}
                    </div>
                  ) : (
                    <div className="card overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-50 text-sm font-medium">
                        Log hari ini — {selSec}
                      </div>
                      {todayActs.map((a: any) => {
                        const g = a.output - tph
                        return (
                          <div key={a.id} className="px-4 py-3 border-b border-gray-50 last:border-0">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-medium text-gray-700">{a.hour}:00</span>
                              <div className="flex items-center gap-3">
                                <span className="text-lg font-bold text-gray-900">{a.output}</span>
                                <span className={`text-sm font-medium ${g >= 0 ? 'text-teal' : 'text-red-600'}`}>
                                  {g >= 0 ? '+' : ''}{g}
                                </span>
                              </div>
                            </div>
                            <div className="flex gap-3 mt-1 text-xs text-gray-400">
                              <span>MP: {a.mpActual}</span>
                              {a.downtime > 0 && <span className="text-amber-600">DT: {a.downtime}m {a.dtReason ? `(${a.dtReason})` : ''}</span>}
                              {a.defect > 0 && <span className="text-red-500">Defect: {a.defect}</span>}
                            </div>
                            {/* Progress bar */}
                            <div className="mt-1.5 w-full bg-gray-100 rounded-full h-1.5">
                              <div className={`h-1.5 rounded-full ${g >= 0 ? 'bg-teal' : 'bg-red-400'}`}
                                style={{ width: Math.min(a.output / tph * 100, 100) + '%' }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ── STANDAR VIEW ── */}
              {view === 'std' && section && (
                <div className="space-y-3">
                  {/* Info standar */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'Std MP', value: section.stdMP + ' orang' },
                      { label: 'Takt time', value: takt + ' detik' },
                      { label: 'Target/jam', value: tph + ' pairs' },
                      { label: 'Total operasi', value: section.operations?.length + ' ops' },
                    ].map(m => (
                      <div key={m.label} className="card p-3 text-center">
                        <div className="text-lg font-bold text-gray-900">{m.value}</div>
                        <div className="text-xs text-gray-400 mt-1">{m.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Daftar operasi */}
                  <div className="card overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-50 text-sm font-medium">
                      Operasi {selSec}
                    </div>
                    {(section.operations ?? []).map((op: any, i: number) => {
                      const gwt = parseFloat(((op.va + op.nvan + op.nva) * (1 + op.allowance)).toFixed(1))
                      const isBn = gwt > takt
                      return (
                        <div key={op.id} className={`px-4 py-2.5 border-b border-gray-50 last:border-0 ${isBn ? 'bg-red-50' : ''}`}>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-800">{i + 1}. {op.name}</span>
                            <span className={`text-sm font-medium ${isBn ? 'text-red-600' : 'text-gray-600'}`}>
                              {gwt}s {isBn ? '⚠' : ''}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
