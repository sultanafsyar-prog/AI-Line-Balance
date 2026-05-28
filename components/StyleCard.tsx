'use client'
import { useState, useEffect } from 'react'

/**
 * StyleCard
 *
 * Komponen utama untuk menampilkan:
 * 1. Foto + info model yang sedang jalan
 * 2. IE Standard summary per section
 * 3. Target harian vs aktual
 *
 * Dipakai di:
 * - Halaman detail line (tab baru "Style & Target")
 * - TV Andon Board (versi compact)
 */

interface Section {
  name:       string
  taktTime:   number
  stdMP:      number
  operations: { id: string; name: string; gwt?: number }[]
}

interface Model {
  id:        string
  name:      string
  article?:  string
  lineType:  string
  imageUrl?: string
  sections:  Section[]
}

interface DailyTarget {
  targetPairs: number
  setBy:       string
  note?:       string
}

interface Props {
  model:        Model | null
  lineId:       string
  totalActual:  number   // total output aktual hari ini semua section
  canSetTarget: boolean  // true jika user adalah PPIC/IE Admin/Management
  compact?:     boolean  // true untuk versi TV
}

function pph(taktTime: number) {
  return taktTime > 0 ? Math.floor(3600 / taktTime) : 0
}

function lbrCalc(ops: { gwt?: number }[], taktTime: number) {
  if (!ops.length || !taktTime) return 0
  const totalGWT = ops.reduce((s, o) => s + (o.gwt ?? 0), 0)
  return Math.round((totalGWT / (ops.length * taktTime)) * 100)
}

export default function StyleCard({ model, lineId, totalActual, canSetTarget, compact }: Props) {
  const [target,       setTarget]       = useState<DailyTarget | null>(null)
  const [showSetForm,  setShowSetForm]  = useState(false)
  const [inputTarget,  setInputTarget]  = useState('')
  const [inputNote,    setInputNote]    = useState('')
  const [saving,       setSaving]       = useState(false)
  const [uploadingImg, setUploadingImg] = useState(false)
  const [imgUrl,       setImgUrl]       = useState(model?.imageUrl ?? null)

  // Load target harian
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
    setUploadingImg(true)
    const formData = new FormData()
    formData.append('image', file)
    try {
      const res  = await fetch(`/api/models/upload-image`, {
        method: 'POST',
        body:   formData
      })
      const data = await res.json()
      if (data.imageUrl) setImgUrl(data.imageUrl)
    } finally { setUploadingImg(false) }
  }

  if (!model) {
    return (
      <div style={{
        padding: '32px', textAlign: 'center',
        border: '1px dashed var(--color-border-secondary)',
        borderRadius: 'var(--border-radius-lg)',
        color: 'var(--color-text-secondary)', fontSize: '13px'
      }}>
        Line belum ada model yang di-assign.
      </div>
    )
  }

  // Hitung gap target
  const gapPairs  = target ? totalActual - target.targetPairs : null
  const gapPct    = target ? Math.round((totalActual / target.targetPairs) * 100) : null
  const gapColor  = gapPairs === null ? 'var(--color-text-secondary)'
    : gapPairs >= 0 ? 'var(--color-text-success)' : 'var(--color-text-danger)'

  if (compact) {
    // ── Versi compact untuk TV ─────────────────────────────
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {imgUrl && (
          <img src={imgUrl} alt={model.name}
            style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />
        )}
        <div>
          <div style={{ fontSize: '14px', fontWeight: 600 }}>{model.name}</div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{model.article}</div>
        </div>
        {target && (
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: gapColor }}>
              {totalActual} / {target.targetPairs}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)' }}>
              {gapPairs !== null && (gapPairs >= 0 ? `+${gapPairs}` : gapPairs)} pairs
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Versi full untuk halaman line detail ──────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      {/* ── Model header ── */}
      <div style={{
        display: 'flex', gap: '16px', alignItems: 'flex-start',
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--border-radius-lg)', padding: '16px'
      }}>
        {/* Foto model */}
        <div style={{
          width: '120px', height: '120px', flexShrink: 0,
          borderRadius: 'var(--border-radius-md)',
          overflow: 'hidden', position: 'relative',
          background: 'var(--color-background-secondary)',
          border: '0.5px solid var(--color-border-tertiary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {imgUrl ? (
            <img src={imgUrl} alt={model.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
              stroke="var(--color-text-tertiary)" strokeWidth="1.5">
              <path d="M12 2C8 2 4 6 4 10c0 5.25 8 12 8 12s8-6.75 8-12c0-4-4-8-8-8z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          )}
          {/* Upload button overlay */}
          {canSetTarget && (
            <label style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'rgba(0,0,0,0.55)', padding: '6px',
              textAlign: 'center', cursor: 'pointer',
              fontSize: '10px', color: '#fff',
            }}>
              {uploadingImg ? 'Uploading...' : imgUrl ? 'Ganti foto' : 'Upload foto'}
              <input type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f) }} />
            </label>
          )}
        </div>

        {/* Info model */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
            <span style={{ fontSize: '22px', fontWeight: 500, color: 'var(--color-text-primary)' }}>
              {model.name}
            </span>
            <span style={{
              background: 'var(--color-background-info)', color: 'var(--color-text-info)',
              fontSize: '12px', padding: '2px 8px', borderRadius: '99px', fontWeight: 500
            }}>
              {model.article}
            </span>
            <span style={{
              background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)',
              fontSize: '12px', padding: '2px 8px', borderRadius: '99px',
            }}>
              {model.lineType === 'BIG' ? 'Big Line' : 'Mini Line'}
            </span>
          </div>

          <div style={{
            fontSize: '12px', color: 'var(--color-text-secondary)',
            marginBottom: '10px'
          }}>
            {model.sections.length} section · {model.sections.reduce((s, sec) => s + sec.operations.length, 0)} operasi total
          </div>

          {/* Target harian */}
          <div style={{
            background: 'var(--color-background-secondary)',
            borderRadius: 'var(--border-radius-md)', padding: '10px 12px',
          }}>
            {target ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '20px', fontWeight: 500, color: gapColor }}>
                    {totalActual.toLocaleString()}
                  </span>
                  <span style={{ fontSize: '14px', color: 'var(--color-text-secondary)' }}>
                    / {target.targetPairs.toLocaleString()} pairs
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: gapColor }}>
                    ({gapPct}%) {gapPairs !== null && (gapPairs >= 0 ? `+${gapPairs}` : gapPairs)}
                  </span>
                </div>
                {/* Progress bar */}
                <div style={{ height: '6px', background: 'var(--color-border-tertiary)', borderRadius: '99px', marginBottom: '4px' }}>
                  <div style={{
                    height: '100%', borderRadius: '99px',
                    width: `${Math.min(gapPct ?? 0, 100)}%`,
                    background: gapPairs !== null && gapPairs >= 0
                      ? 'var(--color-text-success)' : 'var(--color-text-warning)',
                    transition: 'width 0.3s'
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>
                    Target set oleh {target.setBy}
                    {target.note && ` · ${target.note}`}
                  </span>
                  {canSetTarget && (
                    <button onClick={() => { setInputTarget(String(target.targetPairs)); setShowSetForm(true) }}
                      style={{ fontSize: '11px', color: 'var(--color-text-info)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      Ubah target
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                  Target harian belum di-set
                </span>
                {canSetTarget && (
                  <button onClick={() => setShowSetForm(true)} style={{
                    fontSize: '12px', padding: '5px 12px', borderRadius: 'var(--border-radius-md)',
                    border: '0.5px solid var(--color-border-secondary)',
                    background: 'transparent', cursor: 'pointer', color: 'var(--color-text-primary)'
                  }}>
                    Set target hari ini
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Form set target ── */}
      {showSetForm && (
        <div style={{
          background: 'var(--color-background-primary)',
          border: '0.5px solid var(--color-border-secondary)',
          borderRadius: 'var(--border-radius-lg)', padding: '14px 16px'
        }}>
          <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>
            Set target produksi hari ini
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input type="number" placeholder="Target pairs (contoh: 1200)"
              value={inputTarget} onChange={e => setInputTarget(e.target.value)}
              style={{ flex: 1, padding: '7px 10px', borderRadius: 'var(--border-radius-md)',
                border: '0.5px solid var(--color-border-secondary)', fontSize: '13px' }} />
          </div>
          <input type="text" placeholder="Catatan (opsional, misal: ada order urgent)"
            value={inputNote} onChange={e => setInputNote(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', borderRadius: 'var(--border-radius-md)',
              border: '0.5px solid var(--color-border-secondary)', fontSize: '13px',
              marginBottom: '10px', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setShowSetForm(false)} style={{
              flex: 1, padding: '7px', borderRadius: 'var(--border-radius-md)',
              border: '0.5px solid var(--color-border-secondary)',
              background: 'transparent', cursor: 'pointer', fontSize: '13px'
            }}>Batal</button>
            <button onClick={saveTarget} disabled={saving} style={{
              flex: 2, padding: '7px', borderRadius: 'var(--border-radius-md)',
              border: 'none', background: saving ? 'var(--color-border-secondary)' : '#0F6E56',
              color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '13px', fontWeight: 500
            }}>
              {saving ? 'Menyimpan...' : 'Simpan target'}
            </button>
          </div>
        </div>
      )}

      {/* ── IE Standard per section ── */}
      <div style={{
        background: 'var(--color-background-primary)',
        border: '0.5px solid var(--color-border-tertiary)',
        borderRadius: 'var(--border-radius-lg)', overflow: 'hidden'
      }}>
        <div style={{
          padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-tertiary)',
          fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)',
          display: 'flex', alignItems: 'center', gap: '6px'
        }}>
          Standar IE — {model.name} ({model.article})
        </div>

        {/* Header tabel */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 60px 60px 60px 60px 60px',
          padding: '7px 14px',
          background: 'var(--color-background-secondary)',
          fontSize: '11px', fontWeight: 500, color: 'var(--color-text-secondary)',
          borderBottom: '0.5px solid var(--color-border-tertiary)'
        }}>
          <span>Section</span>
          <span style={{ textAlign: 'center' }}>Ops</span>
          <span style={{ textAlign: 'center' }}>TT (s)</span>
          <span style={{ textAlign: 'center' }}>Std MP</span>
          <span style={{ textAlign: 'center' }}>PPH</span>
          <span style={{ textAlign: 'center' }}>LBR</span>
        </div>

        {model.sections.map((sec, i) => {
          const lbr = lbrCalc(sec.operations, sec.taktTime)
          const ph  = pph(sec.taktTime)
          return (
            <div key={sec.name} style={{
              display: 'grid', gridTemplateColumns: '1fr 60px 60px 60px 60px 60px',
              padding: '8px 14px',
              background: i % 2 === 0 ? 'var(--color-background-primary)' : 'var(--color-background-secondary)',
              borderBottom: '0.5px solid var(--color-border-tertiary)',
              fontSize: '12px', color: 'var(--color-text-primary)', alignItems: 'center'
            }}>
              <span style={{ fontWeight: 500 }}>{sec.name}</span>
              <span style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                {sec.operations.length}
              </span>
              <span style={{ textAlign: 'center' }}>{sec.taktTime}s</span>
              <span style={{ textAlign: 'center' }}>{sec.stdMP}</span>
              <span style={{ textAlign: 'center', fontWeight: 500, color: '#0F6E56' }}>{ph}</span>
              <span style={{ textAlign: 'center' }}>
                <span style={{
                  background: lbr >= 80 ? 'var(--color-background-success)'
                    : lbr >= 60 ? 'var(--color-background-warning)' : 'var(--color-background-danger)',
                  color: lbr >= 80 ? 'var(--color-text-success)'
                    : lbr >= 60 ? 'var(--color-text-warning)' : 'var(--color-text-danger)',
                  padding: '1px 6px', borderRadius: '99px', fontSize: '11px', fontWeight: 500
                }}>
                  {lbr}%
                </span>
              </span>
            </div>
          )
        })}

        {/* Footer total */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 60px 60px 60px 60px 60px',
          padding: '8px 14px',
          background: 'var(--color-background-secondary)',
          fontSize: '12px', fontWeight: 500, color: 'var(--color-text-primary)'
        }}>
          <span>Total</span>
          <span style={{ textAlign: 'center' }}>
            {model.sections.reduce((s, sec) => s + sec.operations.length, 0)}
          </span>
          <span style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>—</span>
          <span style={{ textAlign: 'center' }}>
            {model.sections.reduce((s, sec) => s + sec.stdMP, 0)}
          </span>
          <span style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>—</span>
          <span style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>—</span>
        </div>
      </div>
    </div>
  )
}
