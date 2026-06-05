'use client'
import { useState, useEffect } from 'react'

interface Operation { id: string; name: string; gwt?: number | null }
interface Section {
  name:       string
  taktTime:   number
  stdMP:      number
  operations: Operation[]
}
interface Model {
  id:        string
  name:      string
  article?:  string
  lineType:  string
  imageUrl?: string | null
  sections:  Section[]
}
interface DailyTarget {
  targetPairs: number
  setBy:       string
  note?:       string
}
interface SectionActual {
  name:   string
  ller:   number | null
  totOut: number
  totDT:  number
  totDef: number
}
interface Props {
  model:           Model | null
  lineId:          string
  totalActual:     number
  sectionActuals?: SectionActual[]
  canSetTarget:    boolean
  compact?:        boolean
}

function pph(taktTime: number) {
  return taktTime > 0 ? Math.floor(3600 / taktTime) : 0
}

function lbrCalc(ops: Operation[], taktTime: number) {
  if (!ops.length || !taktTime) return 0
  const totalGWT = ops.reduce((s, o) => s + (Number(o.gwt) || 0), 0)
  if (totalGWT === 0) return 0
  return Math.round((totalGWT / (ops.length * taktTime)) * 100)
}

function lbrColor(lbr: number) {
  if (lbr === 0) return { bg: 'var(--color-background-secondary)', text: 'var(--color-text-secondary)' }
  if (lbr >= 80) return { bg: 'var(--color-background-success)', text: 'var(--color-text-success)' }
  if (lbr >= 65) return { bg: 'var(--color-background-warning)', text: 'var(--color-text-warning)' }
  return { bg: 'var(--color-background-danger)', text: 'var(--color-text-danger)' }
}

function llerColor(ller: number) {
  if (ller >= 90) return { bg: 'var(--color-background-success)', text: 'var(--color-text-success)', border: 'var(--color-border-success)' }
  if (ller >= 75) return { bg: 'var(--color-background-warning)', text: 'var(--color-text-warning)', border: 'var(--color-border-warning)' }
  return { bg: 'var(--color-background-danger)', text: 'var(--color-text-danger)', border: 'var(--color-border-danger)' }
}

export default function StyleCard({ model, lineId, totalActual, sectionActuals = [], canSetTarget, compact }: Props) {
  const [target,        setTarget]        = useState<DailyTarget | null>(null)
  const [showSetForm,   setShowSetForm]   = useState(false)
  const [inputTarget,   setInputTarget]   = useState('')
  const [inputNote,     setInputNote]     = useState('')
  const [saving,        setSaving]        = useState(false)
  const [uploadingImg,  setUploadingImg]  = useState(false)
  const [imgUrl,        setImgUrl]        = useState(model?.imageUrl ?? null)

  useEffect(() => {
    if (!lineId) return
    fetch(`/api/daily-target?lineId=${lineId}`)
      .then(r => r.json())
      .then(d => { if (d.target) setTarget(d.target) })
      .catch(() => {})
  }, [lineId])

  async function saveTarget() {
    const val = parseInt(inputTarget)
    if (!val || val <= 0) return
    setSaving(true)
    try {
      const res  = await fetch('/api/daily-target', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ lineId, targetPairs: val, note: inputNote || undefined })
      })
      const data = await res.json()
      if (data.success) {
        setTarget(data.target)
        setShowSetForm(false)
        setInputTarget('')
        setInputNote('')
      }
    } finally { setSaving(false) }
  }

  async function uploadImage(file: File) {
    if (!model?.id) return
    setUploadingImg(true)
    const formData = new FormData()
    formData.append('image', file)
    try {
      const res  = await fetch(`/api/models/upload-image?modelId=${model.id}`, {
        method: 'POST', body: formData
      })
      const data = await res.json()
      if (data.imageUrl) setImgUrl(data.imageUrl)
    } finally { setUploadingImg(false) }
  }

  if (!model) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', border: '1px dashed var(--color-border-secondary)', borderRadius: 'var(--border-radius-lg)', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
        Line belum ada model yang di-assign.
      </div>
    )
  }

  const gapPairs = target ? totalActual - target.targetPairs : null
  const gapPct   = target && target.targetPairs > 0 ? Math.round((totalActual / target.targetPairs) * 100) : null
  const gapColor = gapPairs === null ? 'var(--color-text-secondary)' : gapPairs >= 0 ? 'var(--color-text-success)' : 'var(--color-text-danger)'

  // Ringkasan untuk manager
  const totalDefect   = sectionActuals.reduce((s, a) => s + a.totDef, 0)
  const totalDT       = sectionActuals.reduce((s, a) => s + a.totDT, 0)
  const validLlers    = sectionActuals.filter(a => a.ller !== null)
  const avgLler       = validLlers.length > 0 ? Math.round(validLlers.reduce((s, a) => s + (a.ller ?? 0), 0) / validLlers.length) : null
  const defectRate    = totalActual > 0 ? ((totalDefect / totalActual) * 100).toFixed(1) : '0'
  const lowLbrSecs    = model.sections.filter(s => lbrCalc(s.operations, s.taktTime) > 0 && lbrCalc(s.operations, s.taktTime) < 65)
  const highDefect    = parseFloat(defectRate) > 3
  const noTarget      = !target
  const hasWarnings   = lowLbrSecs.length > 0 || highDefect || noTarget

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {imgUrl ? (
          <img src={imgUrl} alt={model.name} style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />
        ) : (
          <div style={{ width: '48px', height: '48px', background: 'var(--color-background-secondary)', borderRadius: '6px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.5">
              <path d="M4 16s2-4 8-4 8 4 8 4"/><path d="M4 16v3h16v-3"/>
            </svg>
          </div>
        )}
        <div>
          <div style={{ fontSize: '13px', fontWeight: 500 }}>{model.name}</div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{model.article}</div>
        </div>
        {target && (
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: gapColor }}>{totalActual} / {target.targetPairs}</div>
            <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>{gapPairs !== null && (gapPairs >= 0 ? `+${gapPairs}` : gapPairs)} pairs</div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* ── 1. HEADER MODEL ── */}
      <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', padding: '16px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>

        {/* Foto */}
        <div style={{ width: '110px', height: '110px', flexShrink: 0, borderRadius: 'var(--border-radius-md)', overflow: 'hidden', position: 'relative', background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {imgUrl ? (
            <img src={imgUrl} alt={model.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <svg width="32" height="32" viewBox="0 0 48 48" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.5">
                <path d="M6 32c0 0 4-8 12-8s10 6 16 6 8-4 8-4v8c0 2-2 4-4 4H10c-2 0-4-2-4-4v-2z"/>
                <path d="M6 32s2-4 6-6l4-2 2-6 6-2 4 2 2 4"/>
              </svg>
              <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>Belum ada foto</span>
            </div>
          )}
          {/* Badge NB */}
          <div style={{ position: 'absolute', top: '6px', left: '6px', background: '#0F6E56', borderRadius: '4px', padding: '2px 5px', fontSize: '9px', fontWeight: 700, color: '#fff' }}>NB</div>
          {/* Upload overlay */}
          {canSetTarget && (
            <label style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.55)', padding: '5px', textAlign: 'center', cursor: 'pointer', fontSize: '10px', color: '#fff' }}>
              {uploadingImg ? 'Uploading...' : imgUrl ? 'Ganti foto' : 'Upload foto'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f) }} />
            </label>
          )}
        </div>

        {/* Info model */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
            <span style={{ fontSize: '24px', fontWeight: 500, color: 'var(--color-text-primary)' }}>{model.name}</span>
            <span style={{ background: 'var(--color-background-info)', color: 'var(--color-text-info)', fontSize: '11px', padding: '2px 8px', borderRadius: '99px', fontWeight: 500 }}>{model.article}</span>
            <span style={{ background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)', fontSize: '11px', padding: '2px 8px', borderRadius: '99px' }}>Takt: {model.sections.find((s: any) => s.taktTime > 0)?.taktTime ?? '—'}s</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '10px' }}>
            {model.sections.length} section · {model.sections.reduce((s, sec) => s + sec.operations.length, 0)} operasi · PPH target {pph(model.sections.find(s => s.taktTime > 0)?.taktTime ?? 36)} pairs/jam
          </div>

          {/* Target harian */}
          {target ? (
            <div style={{ background: 'var(--color-background-secondary)', borderRadius: 'var(--border-radius-md)', padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '4px' }}>
                <span style={{ fontSize: '20px', fontWeight: 500, color: gapColor }}>{totalActual.toLocaleString()}</span>
                <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>/ {target.targetPairs.toLocaleString()} pairs</span>
                <span style={{ fontSize: '13px', fontWeight: 500, color: gapColor }}>
                  ({gapPct}%) {gapPairs !== null && (gapPairs >= 0 ? `+${gapPairs}` : `${gapPairs}`)}
                </span>
              </div>
              <div style={{ height: '6px', background: 'var(--color-border-tertiary)', borderRadius: '99px', marginBottom: '6px' }}>
                <div style={{ height: '100%', borderRadius: '99px', width: `${Math.min(gapPct ?? 0, 100)}%`, background: gapPairs !== null && gapPairs >= 0 ? 'var(--color-text-success)' : 'var(--color-text-warning)', transition: 'width 0.3s' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Target set oleh {target.setBy}{target.note && ` · ${target.note}`}</span>
                {canSetTarget && (
                  <button onClick={() => { setInputTarget(String(target.targetPairs)); setShowSetForm(true) }}
                    style={{ fontSize: '11px', color: 'var(--color-text-info)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    Ubah target
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div style={{ background: 'var(--color-background-warning)', border: '0.5px solid var(--color-border-warning)', borderRadius: 'var(--border-radius-md)', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-warning)', marginBottom: '2px' }}>Target harian belum di-set</div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>PPIC harus input target sebelum produksi dimulai</div>
              </div>
              {canSetTarget && (
                <button onClick={() => setShowSetForm(true)} style={{ background: '#0F6E56', color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', flexShrink: 0 }}>
                  + Set target
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Form set target ── */}
      {showSetForm && (
        <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-secondary)', borderRadius: 'var(--border-radius-lg)', padding: '14px 16px' }}>
          <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>Set target produksi hari ini</div>
          <input type="number" placeholder="Jumlah target pairs (contoh: 1200)"
            value={inputTarget} onChange={e => setInputTarget(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--border-radius-md)', border: '0.5px solid var(--color-border-secondary)', fontSize: '13px', marginBottom: '8px', boxSizing: 'border-box' as any }} />
          <input type="text" placeholder="Catatan opsional (misal: ada order urgent NB)"
            value={inputNote} onChange={e => setInputNote(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--border-radius-md)', border: '0.5px solid var(--color-border-secondary)', fontSize: '13px', marginBottom: '10px', boxSizing: 'border-box' as any }} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setShowSetForm(false)} style={{ flex: 1, padding: '8px', borderRadius: 'var(--border-radius-md)', border: '0.5px solid var(--color-border-secondary)', background: 'transparent', cursor: 'pointer', fontSize: '13px' }}>Batal</button>
            <button onClick={saveTarget} disabled={saving} style={{ flex: 2, padding: '8px', borderRadius: 'var(--border-radius-md)', border: 'none', background: saving ? 'var(--color-border-secondary)' : '#0F6E56', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 500 }}>
              {saving ? 'Menyimpan...' : 'Simpan target'}
            </button>
          </div>
        </div>
      )}

      {/* ── 2. KPI AKTUAL HARI INI ── */}
      {sectionActuals.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
          {[
            { label: 'LLER aktual', value: avgLler !== null ? `${avgLler}%` : '—', color: avgLler !== null ? llerColor(avgLler).text : 'var(--color-text-secondary)', bg: avgLler !== null ? llerColor(avgLler).bg : 'var(--color-background-secondary)', sub: avgLler !== null ? (avgLler >= 85 ? 'Di atas target' : 'Di bawah target') : 'Belum ada data' },
            { label: 'Output hari ini', value: `${totalActual}`, color: 'var(--color-text-primary)', bg: 'var(--color-background-secondary)', sub: target ? `target ${target.targetPairs}` : 'target belum di-set' },
            { label: 'Total downtime', value: `${totalDT} mnt`, color: totalDT > 30 ? 'var(--color-text-danger)' : totalDT > 10 ? 'var(--color-text-warning)' : 'var(--color-text-primary)', bg: totalDT > 30 ? 'var(--color-background-danger)' : 'var(--color-background-secondary)', sub: totalDT > 30 ? 'Investigasi segera' : totalDT > 0 ? 'Pantau terus' : 'Normal' },
            { label: 'Defect', value: `${totalDefect} pairs`, color: parseFloat(defectRate) > 3 ? 'var(--color-text-danger)' : 'var(--color-text-primary)', bg: parseFloat(defectRate) > 3 ? 'var(--color-background-danger)' : 'var(--color-background-secondary)', sub: `${defectRate}% rate` },
          ].map((k, i) => (
            <div key={i} style={{ background: k.bg, borderRadius: 'var(--border-radius-md)', padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: '22px', fontWeight: 500, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px' }}>{k.label}</div>
              <div style={{ fontSize: '10px', color: k.color, marginTop: '1px' }}>{k.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── 3. STATUS PER SECTION ── */}
      {sectionActuals.length > 0 && (
        <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', padding: '12px 14px' }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: '8px' }}>Status section hari ini</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {sectionActuals.map(sec => {
              const cl = sec.ller !== null ? llerColor(sec.ller) : { bg: 'var(--color-background-secondary)', text: 'var(--color-text-secondary)', border: 'var(--color-border-tertiary)' }
              return (
                <div key={sec.name} style={{ background: cl.bg, color: cl.text, border: `0.5px solid ${cl.border}`, borderRadius: '99px', padding: '3px 10px', fontSize: '11px', fontWeight: 500 }}>
                  {sec.name} {sec.ller !== null ? `${sec.ller}%` : '—'}
                </div>
              )
            })}
          </div>
          {sectionActuals.filter(s => s.ller === null).length > 0 && (
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '6px' }}>
              {sectionActuals.filter(s => s.ller === null).length} section belum ada input aktual
            </div>
          )}
        </div>
      )}

      {/* ── 4. STANDAR IE TABLE ── */}
      <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: 'var(--border-radius-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Standar IE — {model.name} ({model.article})</span>
          <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--color-text-secondary)' }}>LBR = total GWT ÷ (ops × TT)</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 55px 60px 60px 70px', padding: '7px 14px', background: 'var(--color-background-secondary)', fontSize: '11px', fontWeight: 500, color: 'var(--color-text-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
          <span>Section</span><span style={{ textAlign: 'center' }}>Ops</span><span style={{ textAlign: 'center' }}>TT (s)</span><span style={{ textAlign: 'center' }}>Std MP</span><span style={{ textAlign: 'center' }}>PPH</span><span style={{ textAlign: 'center' }}>LBR</span>
        </div>
        {model.sections.map((sec, i) => {
          const lbr = lbrCalc(sec.operations, sec.taktTime)
          const lc  = lbrColor(lbr)
          return (
            <div key={sec.name} style={{ display: 'grid', gridTemplateColumns: '1fr 50px 55px 60px 60px 70px', padding: '8px 14px', background: i % 2 === 0 ? 'var(--color-background-primary)' : 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: '12px', color: 'var(--color-text-primary)', alignItems: 'center' }}>
              <span style={{ fontWeight: 500 }}>{sec.name}</span>
              <span style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>{sec.operations.length}</span>
              <span style={{ textAlign: 'center' }}>{sec.taktTime}s</span>
              <span style={{ textAlign: 'center' }}>{sec.stdMP}</span>
              <span style={{ textAlign: 'center', fontWeight: 500, color: '#0F6E56' }}>{pph(sec.taktTime)}</span>
              <span style={{ textAlign: 'center' }}>
                <span style={{ background: lc.bg, color: lc.text, padding: '2px 8px', borderRadius: '99px', fontSize: '11px', fontWeight: 500 }}>
                  {lbr > 0 ? `${lbr}%` : '—'}
                </span>
              </span>
            </div>
          )
        })}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 55px 60px 60px 70px', padding: '8px 14px', background: 'var(--color-background-secondary)', fontSize: '12px', fontWeight: 500, color: 'var(--color-text-primary)' }}>
          <span>Total</span>
          <span style={{ textAlign: 'center' }}>{model.sections.reduce((s, sec) => s + sec.operations.length, 0)}</span>
          <span style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>—</span>
          <span style={{ textAlign: 'center' }}>{model.sections.reduce((s, sec) => s + sec.stdMP, 0)}</span>
          <span style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>—</span>
          <span style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>—</span>
        </div>
      </div>

      {/* ── 5. RINGKASAN UNTUK MANAGER ── */}
      {hasWarnings && (
        <div style={{ background: 'var(--color-background-danger)', border: '0.5px solid var(--color-border-danger)', borderRadius: 'var(--border-radius-md)', padding: '10px 14px' }}>
          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-danger)', marginBottom: '6px' }}>Yang perlu perhatian sekarang</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {noTarget && <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>• Target harian belum di-set — minta PPIC input sebelum produksi mulai</div>}
            {lowLbrSecs.map(s => (
              <div key={s.name} style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                • LBR {s.name} {lbrCalc(s.operations, s.taktTime)}% — banyak operasi jauh di bawah takt time, pertimbangkan re-balancing
              </div>
            ))}
            {highDefect && <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>• Defect rate {defectRate}% melebihi batas 3% — lakukan quality check segera</div>}
          </div>
        </div>
      )}
    </div>
  )
}