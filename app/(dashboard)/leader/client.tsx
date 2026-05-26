'use client'
import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { LINE_TYPES } from '@/lib/utils'

const DT_REASONS = ['Mesin rusak', 'Material kurang', 'Style change', 'QC hold', 'Operator kurang', 'Lainnya']
// Shift 07:30-16:30 + overtime
const SHIFT_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
const OT_HOURS    = [17, 18, 19]
const SECTIONS = ['Cutting', 'Treatment', 'Preparation', 'PC Sewing', 'Sewing', 'Assembly', 'Packing']
const SF_SECTIONS = ['Stockfit']

interface Props { lines: any[]; userId: string; userName: string }

export default function LeaderClient({ lines, userId, userName }: Props) {
  const [selLineId, setSelLineId] = useState(lines[0]?.id ?? '')
  const [showOT, setShowOT] = useState(false)
  const activeHours = showOT ? [...SHIFT_HOURS, ...OT_HOURS] : SHIFT_HOURS
  const [selSec, setSelSec]       = useState('Assembly')
  const [tab, setTab]             = useState<'input' | 'status' | 'std'>('input')
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [error, setError]         = useState('')
  const [showLines, setShowLines] = useState(false)

  const nowH = new Date().getHours()
  const [form, setForm] = useState({
    hour: String(nowH >= 7 && nowH <= 18 ? nowH : 7),
    output: '', mpActual: '', downtime: '0', dtReason: '', defect: '0',
  })

  const line    = lines.find(l => l.id === selLineId)
  const model   = line?.assignments?.[0]?.model
  const secs    = line?.building === 'G' ? SF_SECTIONS : SECTIONS

  // Auto-select section pertama yang punya operasi
  const availableSecs = secs.filter(s => model?.sections?.some((ms: any) => ms.name === s && ms.operations?.length > 0))
  const effectiveSec  = availableSecs.includes(selSec) ? selSec : (availableSecs[0] ?? selSec)
  const section = model?.sections?.find((s: any) => s.name === effectiveSec)
  const tph     = model ? LINE_TYPES[model.lineType as 'MINI' | 'BIG'].tph : 100

  // Auto-update selSec kalau section yang dipilih tidak ada di model ini
  // eslint-disable-next-line react-hooks/exhaustive-deps
  if (availableSecs.length > 0 && !availableSecs.includes(selSec)) {
    setTimeout(() => setSelSec(availableSecs[0]), 0)
  }
  const todayActs = (line?.actuals ?? [])
    .filter((a: any) => a.section?.name === selSec)
    .sort((a: any, b: any) => b.hour - a.hour)

  const totalOut = todayActs.reduce((s: number, a: any) => s + a.output, 0)
  const lastOut  = todayActs[0]?.output ?? 0
  const ller     = tph > 0 && lastOut > 0 ? Math.round(lastOut / tph * 100) : 0
  const outputNum = parseInt(form.output) || 0
  const gap      = outputNum > 0 ? outputNum - tph : null
  const hasDT    = parseInt(form.downtime) > 0

  async function handleSave() {
    if (!selLineId) { setError('Pilih line terlebih dahulu'); return }
    if (!section) {
      setError(`Section "${effectiveSec}" tidak ada di model ini. Pilih section lain.`); return
    }
    if (!form.output) { setError('Output wajib diisi'); return }
    if (!form.mpActual) { setError('MP hadir wajib diisi'); return }
    setSaving(true); setError(''); setSaved(false)
    const res = await fetch('/api/actuals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lineId: selLineId, sectionId: section.id,
        date: new Date().toISOString().slice(0, 10),
        hour: parseInt(form.hour),
        output: outputNum,
        mpActual: parseInt(form.mpActual),
        downtime: parseInt(form.downtime) || 0,
        dtReason: form.dtReason,
        defect: parseInt(form.defect) || 0,
      }),
    })
    if (res.ok) {
      setSaved(true)
      setForm(f => ({ ...f, output: '', mpActual: '', downtime: '0', dtReason: '', defect: '0' }))
      setTimeout(() => { setSaved(false); window.location.reload() }, 2000)
    } else {
      const d = await res.json()
      setError(d.error ?? 'Gagal simpan, coba lagi')
    }
    setSaving(false)
  }

  const llerColor = ller >= 90 ? '#1D9E75' : ller >= 75 ? '#EF9F27' : ller > 0 ? '#E24B4A' : '#9CA3AF'

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#F9FAFB' }}>

      {/* ── HEADER ── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E5E7EB', padding: '12px 16px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ flex: 1 }}>
            {lines.length > 1 ? (
              <button onClick={() => setShowLines(!showLines)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>
                  Gdg {line?.building} — Line {line?.lineNo}
                </span>
                <span style={{ fontSize: 12, color: '#6B7280' }}>▼</span>
              </button>
            ) : (
              <span style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>
                Gdg {line?.building} — Line {line?.lineNo}
              </span>
            )}
            {model && (
              <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>
                {model.name} · Target {tph} pairs/jam
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            {ller > 0 && (
              <div style={{ fontSize: 28, fontWeight: 800, color: llerColor, lineHeight: 1 }}>{ller}%</div>
            )}
            <div style={{ fontSize: 11, color: '#9CA3AF' }}>LLER</div>
          </div>
        </div>

        {/* Line selector dropdown */}
        {showLines && lines.length > 1 && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {lines.map(l => (
              <button key={l.id} onClick={() => { setSelLineId(l.id); setShowLines(false) }}
                style={{
                  padding: '8px 14px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  background: l.id === selLineId ? '#1D9E75' : '#F3F4F6',
                  color: l.id === selLineId ? '#fff' : '#374151',
                  border: 'none',
                }}>
                Gdg {l.building} L{l.lineNo}
              </button>
            ))}
          </div>
        )}
      </div>

      {!model ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Belum ada model</div>
          <div style={{ fontSize: 14, color: '#9CA3AF' }}>Hubungi tim IE untuk assign model ke line ini</div>
        </div>
      ) : (
        <>
          {/* ── SECTION TABS ── */}
          <div style={{ background: '#fff', borderBottom: '1px solid #E5E7EB', overflowX: 'auto', whiteSpace: 'nowrap', padding: '8px 12px' }}>
            {secs.map(s => {
              const hasData = model.sections?.find((ms: any) => ms.name === s)?.operations?.length > 0
              return (
                <button key={s} onClick={() => setSelSec(s)} 
                  style={{
                    display: 'inline-block', padding: '8px 14px', marginRight: 6,
                    borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: selSec === s ? '#1D9E75' : hasData ? '#F0FDF9' : '#F3F4F6',
                    color: selSec === s ? '#fff' : hasData ? '#065F46' : '#9CA3AF',
                    border: selSec === s ? 'none' : `1px solid ${hasData ? '#A7F3D0' : '#E5E7EB'}`,
                  }}>
                  {s}
                </button>
              )
            })}
          </div>

          {/* ── CONTENT ── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 100px' }}>

            {/* ─ INPUT TAB ─ */}
            {tab === 'input' && (
              <div>
                {/* Jam selector */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    Pilih jam
                  </div>
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                    {activeHours.map((h: number) => (
                      <button key={h} onClick={() => setForm(f => ({ ...f, hour: String(h) }))}
                        style={{
                          flexShrink: 0, width: 52, height: 48, borderRadius: 10, fontSize: 14,
                          fontWeight: 700, cursor: 'pointer', border: 'none',
                          background: form.hour === String(h) ? '#1D9E75' : '#F3F4F6',
                          color: form.hour === String(h) ? '#fff' : '#6B7280',
                        }}>
                        {h}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Output */}
                <div style={{ background: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    Output jam {form.hour}:00
                  </div>
                  <input type="number" inputMode="numeric" pattern="[0-9]*"
                    placeholder={`Target: ${tph}`}
                    value={form.output}
                    onChange={e => setForm(f => ({ ...f, output: e.target.value }))}
                    style={{
                      width: '100%', height: 72, fontSize: 36, fontWeight: 800,
                      textAlign: 'center', borderRadius: 12, border: '2px solid',
                      borderColor: gap !== null ? (gap >= 0 ? '#1D9E75' : '#EF4444') : '#E5E7EB',
                      outline: 'none', background: gap !== null ? (gap >= 0 ? '#F0FDF9' : '#FEF2F2') : '#F9FAFB',
                      color: '#111827', boxSizing: 'border-box',
                    }} />
                  {gap !== null && (
                    <div style={{ textAlign: 'center', marginTop: 8, fontSize: 15, fontWeight: 700, color: gap >= 0 ? '#1D9E75' : '#EF4444' }}>
                      {gap >= 0 ? `+${gap}` : gap} dari target {tph}
                    </div>
                  )}
                </div>

                {/* MP Hadir */}
                <div style={{ background: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    MP hadir {section?.stdMP ? `(std: ${section.stdMP})` : ''}
                  </div>
                  <input type="number" inputMode="numeric" pattern="[0-9]*"
                    placeholder={section?.stdMP ? String(Math.round(section.stdMP)) : '0'}
                    value={form.mpActual}
                    onChange={e => setForm(f => ({ ...f, mpActual: e.target.value }))}
                    style={{
                      width: '100%', height: 64, fontSize: 32, fontWeight: 800,
                      textAlign: 'center', borderRadius: 12, border: '2px solid #E5E7EB',
                      outline: 'none', background: '#F9FAFB', color: '#111827',
                      boxSizing: 'border-box',
                    }} />
                </div>

                {/* DT & Defect */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  {[
                    { key: 'downtime', label: 'Downtime (mnt)', placeholder: '0' },
                    { key: 'defect', label: 'Defect (pairs)', placeholder: '0' },
                  ].map(({ key, label, placeholder }) => (
                    <div key={key} style={{ background: '#fff', borderRadius: 16, padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
                      <input type="number" inputMode="numeric" pattern="[0-9]*"
                        placeholder={placeholder}
                        value={form[key as 'downtime' | 'defect']}
                        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                        style={{
                          width: '100%', height: 52, fontSize: 24, fontWeight: 700,
                          textAlign: 'center', borderRadius: 10, border: '2px solid #E5E7EB',
                          outline: 'none', background: '#F9FAFB', color: '#111827',
                          boxSizing: 'border-box',
                        }} />
                    </div>
                  ))}
                </div>

                {/* Alasan DT */}
                {hasDT && (
                  <div style={{ background: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', marginBottom: 8 }}>Alasan downtime</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {DT_REASONS.map(r => (
                        <button key={r} onClick={() => setForm(f => ({ ...f, dtReason: r }))}
                          style={{
                            padding: '10px 8px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            background: form.dtReason === r ? '#1D9E75' : '#F3F4F6',
                            color: form.dtReason === r ? '#fff' : '#374151',
                            border: 'none', textAlign: 'center',
                          }}>
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Error / Success */}
                {error && (
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '12px 16px', marginBottom: 12, fontSize: 14, color: '#DC2626', fontWeight: 500 }}>
                    ⚠ {error}
                  </div>
                )}
                {saved && (
                  <div style={{ background: '#F0FDF9', border: '1px solid #A7F3D0', borderRadius: 12, padding: '12px 16px', marginBottom: 12, fontSize: 14, color: '#065F46', fontWeight: 600, textAlign: 'center' }}>
                    ✅ Data jam {form.hour}:00 berhasil disimpan!
                  </div>
                )}
              </div>
            )}

            {/* ─ STATUS TAB ─ */}
            {tab === 'status' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
                  {[
                    { label: 'Total output', value: `${totalOut}`, sub: 'pairs hari ini', color: '#111827' },
                    { label: 'Jam input', value: `${todayActs.length}`, sub: 'jam', color: '#111827' },
                    { label: 'LLER terakhir', value: `${ller}%`, sub: '', color: llerColor },
                  ].map(m => (
                    <div key={m.label} style={{ background: '#fff', borderRadius: 16, padding: '14px 10px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: m.color }}>{m.value}</div>
                      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>{m.label}</div>
                    </div>
                  ))}
                </div>

                {todayActs.length === 0 ? (
                  <div style={{ background: '#fff', borderRadius: 16, padding: 40, textAlign: 'center', color: '#9CA3AF', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                    Belum ada input hari ini untuk {selSec}
                  </div>
                ) : (
                  <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    {todayActs.map((a: any, i: number) => {
                      const g = a.output - tph
                      const pct = Math.min(a.output / tph * 100, 100)
                      return (
                        <div key={a.id} style={{ padding: '14px 16px', borderBottom: i < todayActs.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>{a.hour}:00 — {a.hour + 1}:00</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 22, fontWeight: 800, color: '#111827' }}>{a.output}</span>
                              <span style={{ fontSize: 14, fontWeight: 700, color: g >= 0 ? '#1D9E75' : '#EF4444' }}>
                                {g >= 0 ? '+' : ''}{g}
                              </span>
                            </div>
                          </div>
                          <div style={{ background: '#F3F4F6', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                            <div style={{ height: '100%', borderRadius: 4, width: `${pct}%`, background: g >= 0 ? '#1D9E75' : '#EF4444' }} />
                          </div>
                          <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12, color: '#9CA3AF' }}>
                            <span>MP: {a.mpActual}</span>
                            {a.downtime > 0 && <span style={{ color: '#EF9F27' }}>DT: {a.downtime}m {a.dtReason ? `(${a.dtReason})` : ''}</span>}
                            {a.defect > 0 && <span style={{ color: '#EF4444' }}>Defect: {a.defect}</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ─ STANDAR TAB ─ */}
            {tab === 'std' && (
              <div>
                {!section ? (
                  <div style={{ background: '#fff', borderRadius: 16, padding: 40, textAlign: 'center', color: '#9CA3AF' }}>
                    Tidak ada standar untuk section {selSec}
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                      {[
                        { label: 'Std MP', value: `${section.stdMP} org` },
                        { label: 'Takt time', value: `${section.taktTime}s` },
                        { label: 'Target/jam', value: `${tph} pairs` },
                        { label: 'Total ops', value: `${section.operations?.length ?? 0}` },
                      ].map(m => (
                        <div key={m.label} style={{ background: '#fff', borderRadius: 16, padding: '14px 12px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                          <div style={{ fontSize: 22, fontWeight: 800, color: '#111827' }}>{m.value}</div>
                          <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>{m.label}</div>
                        </div>
                      ))}
                    </div>

                    <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                      <div style={{ padding: '14px 16px', borderBottom: '1px solid #F3F4F6', fontSize: 13, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>
                        Daftar operasi — {selSec}
                      </div>
                      {(section.operations ?? []).map((op: any, i: number) => {
                        const gwt = parseFloat(((op.va + op.nvan + op.nva) * (1 + op.allowance)).toFixed(1))
                        const isBn = gwt > section.taktTime
                        return (
                          <div key={op.id} style={{
                            padding: '12px 16px',
                            borderBottom: i < section.operations.length - 1 ? '1px solid #F3F4F6' : 'none',
                            background: isBn ? '#FEF2F2' : '#fff',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 14, color: '#374151', flex: 1, marginRight: 8 }}>{i + 1}. {op.name}</span>
                              <span style={{ fontSize: 15, fontWeight: 700, color: isBn ? '#EF4444' : '#374151', flexShrink: 0 }}>
                                {gwt}s {isBn ? '⚠' : ''}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── BOTTOM: SAVE BUTTON (input tab) or NAV ── */}
          {tab === 'input' ? (
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 480, margin: '0 auto', padding: '12px 16px 24px', background: '#F9FAFB', borderTop: '1px solid #E5E7EB' }}>
              <button onClick={handleSave} disabled={saving}
                style={{
                  width: '100%', height: 60, borderRadius: 16, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                  background: saving ? '#9CA3AF' : '#1D9E75', color: '#fff',
                  fontSize: 18, fontWeight: 800, letterSpacing: '0.02em',
                  boxShadow: saving ? 'none' : '0 4px 12px rgba(29,158,117,0.4)',
                }}>
                {saving ? 'Menyimpan...' : `✓ Simpan jam ${form.hour}:00`}
              </button>
            </div>
          ) : (
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 480, margin: '0 auto', background: '#fff', borderTop: '1px solid #E5E7EB', display: 'flex' }}>
              {[
                { key: 'status', icon: '◉', label: 'Status' },
                { key: 'input', icon: '✎', label: 'Input' },
                { key: 'std', icon: '📋', label: 'Standar' },
              ].map(t => (
                <button key={t.key} onClick={() => setTab(t.key as any)}
                  style={{
                    flex: 1, padding: '12px 8px 16px', border: 'none', cursor: 'pointer',
                    background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    borderTop: tab === t.key ? '3px solid #1D9E75' : '3px solid transparent',
                  }}>
                  <span style={{ fontSize: 20 }}>{t.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: tab === t.key ? '#1D9E75' : '#9CA3AF' }}>{t.label}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Logout di status tab */}
      {tab === 'status' && (
        <div style={{ position: 'fixed', top: 12, right: 16, zIndex: 20 }}>
          <button onClick={() => signOut({ callbackUrl: '/login' })}
            style={{ background: '#F3F4F6', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: '#6B7280', cursor: 'pointer' }}>
            Keluar
          </button>
        </div>
      )}
    </div>
  )
}