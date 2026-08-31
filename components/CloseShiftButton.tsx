'use client'
import { useState } from 'react'
import { useI18n } from '@/lib/i18n'

interface Props {
  lineId:    string
  lineLabel: string
  onClosed?: () => void
  workDate?: string         // override tanggal kerja (leader kirim getWorkDate(shift))
  fixedShiftLabel?: string  // kalau diisi, label shift dikunci (tanpa dropdown)
  hideEmail?: boolean       // sembunyikan field email (lantai produksi tanpa laporan email)
}

const SHIFTS = [
  { key: 'closeShiftBtn.shift1', value: 'Shift 1 (07:30–16:30)' },
  { key: 'closeShiftBtn.shift2', value: 'Shift 2 (20:30–05:30)' },
]

export default function CloseShiftButton({ lineId, lineLabel, onClosed, workDate, fixedShiftLabel, hideEmail }: Props) {
  const { t } = useI18n()
  const [open,    setOpen]    = useState(false)
  const [shift,   setShift]   = useState(fixedShiftLabel ?? SHIFTS[0].value)
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<{ ok: boolean; msg: string } | null>(null)

  async function handleClose() {
    // Email OPSIONAL — hanya validasi format kalau diisi
    if (email && !email.includes('@')) {
      setResult({ ok: false, msg: t('closeShiftBtn.invalidEmail') })
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const res  = await fetch('/api/shift-close', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ lineId, shiftLabel: shift, managerEmail: email, ...(workDate ? { date: workDate } : {}) }),
      })
      const data = await res.json()
      if (res.ok) {
        const msg = (data.message ?? t('closeShiftBtn.closed')) + (data.warning ? ' ⚠ ' + data.warning : '')
        setResult({ ok: true, msg })
        onClosed?.()
      } else {
        setResult({ ok: false, msg: data.error ?? t('closeShiftBtn.closeFailed') })
      }
    } catch {
      setResult({ ok: false, msg: t('closeShiftBtn.connFailed') })
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
          border:       '1px solid #E5E7EB',
          background:   'transparent',
          color:        '#374151',
          fontSize:     '13px',
          fontWeight:   500,
          cursor:       'pointer',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        {/* Ikon flag */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>
        </svg>
        {t('shift.close')}
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
                background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>{t('shift.close')}</div>
                <div style={{ fontSize: '12px', color: '#6B7280' }}>{lineLabel}</div>
              </div>
            </div>

            <div style={{ height: '1px', background: '#E5E7EB', margin: '16px 0' }} />

            {/* Info */}
            <div style={{
              padding: '10px 14px', background: '#F1F5F9',
              borderRadius: '8px', marginBottom: '16px',
              fontSize: '12px', color: '#475569', lineHeight: 1.6,
            }}>
              {hideEmail
                ? t('closeShiftBtn.infoNoEmail')
                : <>{t('closeShiftBtn.info1')} <strong>{t('closeShiftBtn.infoSend')}</strong> {t('closeShiftBtn.infoAnd')} <strong>{t('closeShiftBtn.infoReset')}</strong> {t('closeShiftBtn.info2')}</>}
            </div>

            {/* Pilih shift — dikunci kalau fixedShiftLabel diberikan (mis. dari leader) */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '12px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                {t('closeShiftBtn.shiftToClose')}
              </label>
              {fixedShiftLabel ? (
                <div style={{
                  width: '100%', padding: '8px 12px', borderRadius: '8px',
                  border: '1px solid #E5E7EB', fontSize: '13px',
                  background: '#F9FAFB', color: '#111827', fontWeight: 600,
                }}>{fixedShiftLabel}</div>
              ) : (
                <select
                  value={shift}
                  onChange={e => setShift(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: '8px',
                    border: '1px solid #E5E7EB', fontSize: '13px',
                    background: '#fff', color: '#111827', cursor: 'pointer',
                  }}
                >
                  {SHIFTS.map(s => <option key={s.value} value={s.value}>{t(s.key)}</option>)}
                </select>
              )}
            </div>

            {/* Email manager (opsional) — disembunyikan di lantai produksi */}
            {!hideEmail && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '12px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  {t('closeShiftBtn.managerEmail')} <span style={{ color: '#9CA3AF', fontWeight: 400 }}>({t('closeShiftBtn.optional')})</span>
                </label>
                <input
                  type="email"
                  placeholder="manager@diamond.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: '8px',
                    border: '1px solid #E5E7EB', fontSize: '13px',
                    color: '#111827', boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            {/* Result message */}
            {result && (
              <div style={{
                padding: '10px 14px', borderRadius: '8px', marginBottom: '16px',
                background: result.ok ? '#EFF6FF' : '#FEF2F2',
                color:      result.ok ? '#1D4ED8' : '#DC2626',
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
                  border: '1px solid #E5E7EB', background: 'transparent',
                  fontSize: '13px', color: '#6B7280', cursor: 'pointer',
                }}
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleClose}
                disabled={loading || result?.ok === true}
                style={{
                  flex: 2, padding: '9px', borderRadius: '8px',
                  border: 'none',
                  background: loading || result?.ok ? '#E5E7EB' : '#3B82F6',
                  color:  loading || result?.ok ? '#9CA3AF' : '#fff',
                  fontSize: '13px', fontWeight: 500,
                  cursor: loading || result?.ok ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? t('closeShiftBtn.processing') : result?.ok ? t('closeShiftBtn.done') : email ? t('closeShiftBtn.closeAndSend') : t('closeShiftBtn.closeOnly')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
