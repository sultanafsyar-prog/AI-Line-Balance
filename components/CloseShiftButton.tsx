'use client'
import { useState } from 'react'

interface Props {
  lineId:    string
  lineLabel: string
  onClosed?: () => void
}

const SHIFTS = [
  { label: 'Shift 1 (07:00–15:00)', value: 'Shift 1 (07:00–15:00)' },
  { label: 'Shift 2 (15:00–23:00)', value: 'Shift 2 (15:00–23:00)' },
  { label: 'Shift Malam (23:00–07:00)', value: 'Shift Malam (23:00–07:00)' },
]

export default function CloseShiftButton({ lineId, lineLabel, onClosed }: Props) {
  const [open,    setOpen]    = useState(false)
  const [shift,   setShift]   = useState(SHIFTS[0].value)
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<{ ok: boolean; msg: string } | null>(null)

  async function handleClose() {
    if (!email.includes('@')) {
      setResult({ ok: false, msg: 'Email manager tidak valid.' })
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const res  = await fetch('/api/shift-close', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ lineId, shiftLabel: shift, managerEmail: email }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult({ ok: true, msg: data.message ?? 'Shift berhasil ditutup.' })
        if (data.warning) setResult({ ok: true, msg: data.warning })
        onClosed?.()
      } else {
        setResult({ ok: false, msg: data.error ?? 'Gagal menutup shift.' })
      }
    } catch {
      setResult({ ok: false, msg: 'Gagal konek ke server.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Tombol trigger */}
      <button
        onClick={() => { setOpen(true); setResult(null) }}
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          '6px',
          padding:      '7px 14px',
          borderRadius: '8px',
          border:       '1px solid #E24B4A',
          background:   'transparent',
          color:        '#A32D2D',
          fontSize:     '13px',
          fontWeight:   500,
          cursor:       'pointer',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#FCEBEB')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        {/* Ikon flag */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>
        </svg>
        Tutup Shift
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
          style={{
            position:       'fixed', inset: 0, zIndex: 50,
            background:     'rgba(0,0,0,0.4)',
            display:        'flex', alignItems: 'center', justifyContent: 'center',
            padding:        '16px',
          }}
        >
          <div style={{
            background:   '#fff', borderRadius: '16px',
            padding:      '24px', width: '100%', maxWidth: '440px',
            boxShadow:    '0 20px 60px rgba(0,0,0,0.15)',
          }}>
            {/* Header modal */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '8px',
                background: '#FCEBEB', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#A32D2D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a18' }}>Tutup Shift</div>
                <div style={{ fontSize: '12px', color: '#888780' }}>{lineLabel}</div>
              </div>
            </div>

            <div style={{ height: '1px', background: '#f0f0ef', margin: '16px 0' }} />

            {/* Info */}
            <div style={{
              padding: '10px 14px', background: '#FAEEDA',
              borderRadius: '8px', marginBottom: '16px',
              fontSize: '12px', color: '#854F0B', lineHeight: 1.6,
            }}>
              Menutup shift akan: <strong>mengirim laporan ke email manager</strong> dan <strong>mereset semua alert aktif</strong> di line ini. Data aktual tetap tersimpan untuk laporan historis.
            </div>

            {/* Pilih shift */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '12px', fontWeight: 500, color: '#5F5E5A', display: 'block', marginBottom: '6px' }}>
                Shift yang ditutup
              </label>
              <select
                value={shift}
                onChange={e => setShift(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: '8px',
                  border: '1px solid #e0dfd7', fontSize: '13px',
                  background: '#fff', color: '#1a1a18', cursor: 'pointer',
                }}
              >
                {SHIFTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            {/* Email manager */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '12px', fontWeight: 500, color: '#5F5E5A', display: 'block', marginBottom: '6px' }}>
                Email manager (penerima laporan)
              </label>
              <input
                type="email"
                placeholder="manager@diamond.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: '8px',
                  border: '1px solid #e0dfd7', fontSize: '13px',
                  color: '#1a1a18', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Result message */}
            {result && (
              <div style={{
                padding: '10px 14px', borderRadius: '8px', marginBottom: '16px',
                background: result.ok ? '#E1F5EE' : '#FCEBEB',
                color:      result.ok ? '#0F6E56' : '#A32D2D',
                fontSize:   '13px', lineHeight: 1.5,
              }}>
                {result.ok ? '✓ ' : '✗ '}{result.msg}
              </div>
            )}

            {/* Tombol aksi */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setOpen(false)}
                style={{
                  flex: 1, padding: '9px', borderRadius: '8px',
                  border: '1px solid #e0dfd7', background: 'transparent',
                  fontSize: '13px', color: '#5F5E5A', cursor: 'pointer',
                }}
              >
                Batal
              </button>
              <button
                onClick={handleClose}
                disabled={loading || result?.ok === true}
                style={{
                  flex: 2, padding: '9px', borderRadius: '8px',
                  border: 'none',
                  background: loading || result?.ok ? '#e0dfd7' : '#A32D2D',
                  color:  loading || result?.ok ? '#888780' : '#fff',
                  fontSize: '13px', fontWeight: 500,
                  cursor: loading || result?.ok ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? 'Memproses...' : result?.ok ? 'Selesai ✓' : 'Tutup Shift & Kirim Laporan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
