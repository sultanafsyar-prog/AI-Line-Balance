'use client'
import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { SF_SECTIONS as UTIL_SF_SECTIONS } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import LanguageSwitcher from '@/components/LanguageSwitcher'

const DT_REASONS_I18N: Record<string, { id: string; en: string; 'zh-TW': string }> = {
  machine:  { id: 'Mesin rusak',       en: 'Machine breakdown',  'zh-TW': '機台故障' },
  material: { id: 'Material kurang',   en: 'Material shortage',  'zh-TW': '材料不足' },
  style:    { id: 'Style change',      en: 'Style change',       'zh-TW': '換款' },
  qc:       { id: 'QC hold',           en: 'QC hold',            'zh-TW': 'QC 暫停' },
  operator: { id: 'Operator kurang',   en: 'Operator shortage',  'zh-TW': '人員不足' },
  other:    { id: 'Lainnya',           en: 'Others',             'zh-TW': '其他' },
}
// Shift 1: 07:30-16:30 | OT s/d 19:30
const SHIFT1_HOURS    = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
const SHIFT1_OT_HOURS = [17, 18, 19]
// Shift 2: 20:00-06:00 | OT s/d 09:00
// Virtual hours: 24=00:00*, 25=01:00*, ..., 29=05:00*, 30=06:00*, 31=07:00*
const SHIFT2_HOURS    = [20, 21, 22, 23, 24, 25, 26, 27, 28, 29]
const SHIFT2_OT_HOURS = [30, 31, 32]

function displayHour(h: number): string {
  if (h <= 23) return `${h}:00`
  return `${String(h - 24).padStart(2,'0')}:00*` // * = hari berikutnya
}

// Work date — timezone Asia/Jakarta (UTC+7)
// Shift 2 melewati tengah malam: jam 00:00-07:59 WIB masih dihitung hari kemarin
function getWorkDate(shiftNum: 1 | 2): string {
  const now = new Date()
  // Jam sekarang di WIB
  const wibHour = parseInt(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour: 'numeric', hour12: false }))
  if (shiftNum === 2 && wibHour < 8) {
    // Jam 00-07 WIB: masih bagian shift 2 kemarin
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    return yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
  }
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

// Auto-detect shift dari jam sekarang (WIB)
function detectShift(): 1 | 2 {
  const h = parseInt(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour: 'numeric', hour12: false }))
  if (h >= 20 || h < 8) return 2  // 20:00-07:59 WIB = shift 2
  return 1
}
const SECTIONS = ['Cutting', 'Treatment', 'Preparation', 'PC Sewing', 'Sewing', 'Assembly', 'Packing']
const SF_SECTIONS = UTIL_SF_SECTIONS

interface Props { lines: any[]; userId: string; userName: string }

export default function LeaderClient({ lines, userId, userName }: Props) {
  const { t, locale } = useI18n()
  const [selLineId, setSelLineId] = useState(lines[0]?.id ?? '')
  const [showOT, setShowOT]   = useState(false)
  const [shift, setShift]     = useState<1|2>(detectShift())
  const activeHours = shift === 1
    ? (showOT ? [...SHIFT1_HOURS, ...SHIFT1_OT_HOURS] : SHIFT1_HOURS)
    : (showOT ? [...SHIFT2_HOURS, ...SHIFT2_OT_HOURS] : SHIFT2_HOURS)
  const [selSec, setSelSec]       = useState('Assembly')
  const [tab, setTab]             = useState<'input' | 'status' | 'std' | 'ai'>('input')
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [error, setError]         = useState('')
  const [showLines, setShowLines] = useState(false)
  const [aiResult, setAiResult]   = useState('')
  const [aiLoading, setAiLoading] = useState(false)

  const nowH = new Date().getHours()
  const defaultHour = (() => {
    const detected = detectShift()
    if (detected === 1) return (nowH >= 7 && nowH <= 19) ? nowH : 7
    // Shift 2: jam 20-23 pakai langsung, jam 0-7 pakai virtual (24+)
    if (nowH >= 20) return nowH
    if (nowH < 8) return nowH + 24  // virtual: 0→24, 1→25, ..., 7→31
    return 20 // fallback
  })()
  const [form, setForm] = useState({
    hour: String(defaultHour),
    output: '', mpActual: '', downtime: '0', dtReason: '', defect: '0',
  })

  const line    = lines.find(l => l.id === selLineId)
  const model   = line?.assignments?.[0]?.model
  const secs    = line?.building === 'G' ? SF_SECTIONS : SECTIONS

  // Auto-select section pertama yang punya operasi
  const availableSecs = secs.filter(s => model?.sections?.some((ms: any) => ms.name === s && ms.operations?.length > 0))
  const effectiveSec  = availableSecs.includes(selSec) ? selSec : (availableSecs[0] ?? selSec)
  const section = model?.sections?.find((s: any) => s.name === effectiveSec)
  // TPH dari section taktTime (untuk target output per jam)
  const sectionTakt = section?.taktTime ?? 0
  const tph = sectionTakt > 0 ? Math.floor(3600 / sectionTakt) : 0

  // TheorMP per section: sum(GWT semua ops) / taktTime
  const getGWT = (op: any) => (op.va + op.nvan + op.nva) * (1 + (op.allowance ?? 0.15))
  const sectionTheoMP: Record<string, number> = {}
  for (const sec of (model?.sections ?? [])) {
    if (!sec.taktTime || sec.taktTime <= 0) continue
    const totalGWT = (sec.operations ?? []).reduce((s: number, op: any) => s + getGWT(op), 0)
    sectionTheoMP[sec.name] = parseFloat((totalGWT / sec.taktTime).toFixed(2))
  }

  // Auto-update selSec kalau section yang dipilih tidak ada di model ini
  // eslint-disable-next-line react-hooks/exhaustive-deps
  if (availableSecs.length > 0 && !availableSecs.includes(selSec)) {
    setTimeout(() => setSelSec(availableSecs[0]), 0)
  }

  // Actuals untuk section yang sedang dipilih
  const todayActs = (line?.actuals ?? [])
    .filter((a: any) => a.section?.name === effectiveSec)
    .sort((a: any, b: any) => a.hour - b.hour)

  const totalOut = todayActs.reduce((s: number, a: any) => s + a.output, 0)

  // Section LLER = Theoretical MP / Avg Actual MP × 100%
  const secTheo = sectionTheoMP[effectiveSec] ?? 0
  const secAvgMP = todayActs.length > 0
    ? todayActs.reduce((s: number, a: any) => s + a.mpActual, 0) / todayActs.length : 0
  const sectionLler = secAvgMP > 0 && secTheo > 0
    ? Math.round((secTheo / secAvgMP) * 100) : 0

  // Line LLER = Total TheoMP / Total Avg Actual MP × 100% (semua section)
  const allActs = line?.actuals ?? []
  const secMPMap = new Map<string, { mpSum: number; hours: number }>()
  for (const a of allActs) {
    const sName = a.section?.name ?? ''
    const prev = secMPMap.get(sName) ?? { mpSum: 0, hours: 0 }
    secMPMap.set(sName, { mpSum: prev.mpSum + a.mpActual, hours: prev.hours + 1 })
  }
  let lineTotalTheo = 0, lineTotalActMP = 0
  for (const [sName, data] of secMPMap.entries()) {
    const theo = sectionTheoMP[sName]
    if (theo && theo > 0 && data.hours > 0) {
      lineTotalTheo += theo
      lineTotalActMP += data.mpSum / data.hours
    }
  }
  const lineLler = lineTotalActMP > 0 ? Math.round((lineTotalTheo / lineTotalActMP) * 100) : 0

  // LLER yang ditampilkan di header = LINE level
  const ller = lineLler

  const outputNum = parseInt(form.output) || 0
  const gap      = outputNum > 0 && tph > 0 ? outputNum - tph : null
  const hasDT    = parseInt(form.downtime) > 0

  // Set jam yang sudah ada datanya (untuk dot indicator)
  const filledHours = new Set(todayActs.map((a: any) => a.hour))

  async function handleSave() {
    if (!selLineId) { setError('Pilih line terlebih dahulu'); return }
    if (!section) {
      setError(`Section "${effectiveSec}" tidak ada di model ini. Pilih section lain.`); return
    }
    if (!form.output) { setError('Output wajib diisi'); return }
    if (!form.mpActual) { setError('MP hadir wajib diisi'); return }

    // Konfirmasi overwrite jika jam ini sudah ada data
    if (filledHours.has(parseInt(form.hour))) {
      const existing = todayActs.find((a: any) => a.hour === parseInt(form.hour))
      if (existing && !confirm(`Jam ${displayHour(parseInt(form.hour))} sudah ada data (output: ${existing.output}). Overwrite?`)) {
        return
      }
    }

    setSaving(true); setError(''); setSaved(false)
    const res = await fetch('/api/actuals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lineId: selLineId, sectionId: section.id,
        date: getWorkDate(shift),
        hour: parseInt(form.hour),
        shift,
        output: outputNum,
        mpActual: parseInt(form.mpActual),
        downtime: parseInt(form.downtime) || 0,
        dtReason: form.dtReason,
        defect: parseInt(form.defect) || 0,
      }),
    })
    if (res.ok) {
      setSaved(true)
      // Refresh data tanpa reload halaman
      try {
        const freshRes = await fetch(`/api/actuals?lineId=${selLineId}&date=${getWorkDate(shift)}`)
        if (freshRes.ok) {
          const freshActuals = await freshRes.json()
          // Update line actuals in-place
          if (line) {
            line.actuals = freshActuals
          }
        }
      } catch {}
      // Pindah ke jam berikutnya yang belum diisi
      const currentH = parseInt(form.hour)
      const nextEmpty = activeHours.find((h: number) => h > currentH && !filledHours.has(h))
      if (nextEmpty !== undefined) {
        setForm({ hour: String(nextEmpty), output: '', mpActual: '', downtime: '0', dtReason: '', defect: '0' })
      } else {
        setForm(f => ({ ...f, output: '', mpActual: '', downtime: '0', dtReason: '', defect: '0' }))
      }
      setTimeout(() => setSaved(false), 3000)
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {ller > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: llerColor, lineHeight: 1 }}>{ller}%</div>
                <div style={{ fontSize: 11, color: '#9CA3AF' }}>LLER</div>
              </div>
            )}
            <LanguageSwitcher compact />
            <button onClick={() => signOut({ callbackUrl: '/login' })}
              title={t('common.logout')}
              style={{
                width: 36, height: 36, borderRadius: 10, border: '1px solid #E5E7EB',
                background: '#F9FAFB', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
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
        <div>
          {/* ── SECTION TABS (hanya tampilkan section yang punya operasi) ── */}
          <div style={{ background: '#fff', borderBottom: '1px solid #E5E7EB', overflowX: 'auto', whiteSpace: 'nowrap', padding: '8px 12px' }}>
            {availableSecs.map(s => {
              const secActs = (line?.actuals ?? []).filter((a: any) => a.section?.name === s)
              const hasActual = secActs.length > 0
              return (
                <button key={s} onClick={() => setSelSec(s)} 
                  style={{
                    display: 'inline-block', padding: '8px 14px', marginRight: 6,
                    borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: selSec === s ? '#1D9E75' : hasActual ? '#F0FDF9' : '#F3F4F6',
                    color: selSec === s ? '#fff' : hasActual ? '#065F46' : '#9CA3AF',
                    border: selSec === s ? 'none' : `1px solid ${hasActual ? '#A7F3D0' : '#E5E7EB'}`,
                  }}>
                  {s} {hasActual && <span style={{ fontSize: 10 }}>✓</span>}
                </button>
              )
            })}
            {availableSecs.length === 0 && (
              <span style={{ fontSize: 13, color: '#9CA3AF' }}>Tidak ada section dengan operasi</span>
            )}
          </div>

          {/* ── CONTENT ── */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 100px' }}>

            {/* ─ INPUT TAB ─ */}
            {tab === 'input' && (
              <div>
                {/* Shift selector + OT toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid #E5E7EB' }}>
                    {([1, 2] as const).map(s => (
                      <button key={s} onClick={() => { setShift(s); setForm(f => ({ ...f, hour: String(s === 1 ? 7 : 20) })) }}
                        style={{
                          padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                          background: shift === s ? '#1D9E75' : '#F9FAFB',
                          color: shift === s ? '#fff' : '#6B7280',
                        }}>
                        Shift {s}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setShowOT(!showOT)}
                    style={{
                      padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      background: showOT ? '#FEF3C7' : '#F3F4F6',
                      color: showOT ? '#92400E' : '#6B7280',
                      border: showOT ? '1px solid #FCD34D' : '1px solid #E5E7EB',
                    }}>
                    {showOT ? t('leader.overtimeActive') : t('leader.overtime')}
                  </button>
                </div>

                {/* Info range jam */}
                <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12, padding: '8px 12px', background: '#F9FAFB', borderRadius: 10 }}>
                  {shift === 1
                    ? `Shift 1: 07:00 – 16:00${showOT ? ' + Lembur 17:00 – 19:00' : ''}`
                    : `Shift 2: 20:00 – 05:00${showOT ? ' + Lembur 06:00 – 08:00' : ''}`
                  }
                </div>

                {/* Jam selector */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    Pilih jam
                  </div>
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                    {activeHours.map((h: number) => {
                      const isOT = shift === 1
                        ? SHIFT1_OT_HOURS.includes(h)
                        : SHIFT2_OT_HOURS.includes(h)
                      const isFilled = filledHours.has(h)
                      return (
                        <button key={h} onClick={() => {
                          // Auto-load data jika jam ini sudah ada
                          const existing = todayActs.find((a: any) => a.hour === h)
                          if (existing) {
                            setForm({
                              hour: String(h),
                              output: String(existing.output),
                              mpActual: String(existing.mpActual),
                              downtime: String(existing.downtime ?? 0),
                              dtReason: existing.dtReason ?? '',
                              defect: String(existing.defect ?? 0),
                            })
                          } else {
                            setForm(f => ({ ...f, hour: String(h), output: '', mpActual: '', downtime: '0', dtReason: '', defect: '0' }))
                          }
                        }}
                          style={{
                            flexShrink: 0, width: 52, height: 48, borderRadius: 10, fontSize: 14,
                            fontWeight: 700, cursor: 'pointer', position: 'relative',
                            border: isOT ? '2px solid #FCD34D' : 'none',
                            background: form.hour === String(h) ? '#1D9E75' : isOT ? '#FFFBEB' : '#F3F4F6',
                            color: form.hour === String(h) ? '#fff' : isOT ? '#92400E' : '#6B7280',
                          }}>
                          {displayHour(h)}
                          {/* Dot hijau kalau jam ini sudah ada data */}
                          {isFilled && (
                            <span style={{
                              position: 'absolute', top: 3, right: 3,
                              width: 8, height: 8, borderRadius: '50%',
                              background: form.hour === String(h) ? '#fff' : '#1D9E75',
                              border: '1.5px solid #fff',
                            }} />
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Output */}
                <div style={{ background: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    Output jam {displayHour(parseInt(form.hour))}
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
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', marginBottom: 8 }}>{t('leader.downtimeReason')}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {Object.entries(DT_REASONS_I18N).map(([key, labels]) => {
                        const label = labels[locale as keyof typeof labels] ?? labels.id
                        // Simpan value dalam bahasa Indonesia (konsisten di DB)
                        const dbValue = labels.id
                        return (
                          <button key={key} onClick={() => setForm(f => ({ ...f, dtReason: dbValue }))}
                            style={{
                              padding: '10px 8px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                              background: form.dtReason === dbValue ? '#1D9E75' : '#F3F4F6',
                              color: form.dtReason === dbValue ? '#fff' : '#374151',
                              border: 'none', textAlign: 'center',
                            }}>
                            {label}
                          </button>
                        )
                      })}
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
                    ✅ Data jam {displayHour(parseInt(form.hour))} {t('leader.saved')}
                  </div>
                )}
              </div>
            )}

            {/* ─ STATUS TAB ─ */}
            {tab === 'status' && (
              <div>
                {/* Summary semua section */}
                {(() => {
                  const allActs = line?.actuals ?? []
                  const allTotalOut = allActs.reduce((s: number, a: any) => s + a.output, 0)
                  const allTotalDT = allActs.reduce((s: number, a: any) => s + (a.downtime ?? 0), 0)
                  const allTotalDef = allActs.reduce((s: number, a: any) => s + (a.defect ?? 0), 0)
                  const uniqueHours = new Set(allActs.map((a: any) => a.hour)).size
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                      {[
                        { label: t('status.totalOutput'), value: `${allTotalOut}`, sub: t('common.pairs'), color: '#111827' },
                        { label: 'Line LLER', value: `${lineLler}%`, sub: 'semua section', color: llerColor },
                        { label: `${effectiveSec} LLER`, value: `${sectionLler}%`, sub: 'section aktif', color: sectionLler >= 90 ? '#1D9E75' : sectionLler >= 75 ? '#EF9F27' : '#EF4444' },
                        { label: t('status.totalDT'), value: `${allTotalDT}`, sub: t('common.minutes'), color: allTotalDT > 30 ? '#EF4444' : '#111827' },
                      ].map(m => (
                        <div key={m.label} style={{ background: '#fff', borderRadius: 16, padding: '14px 12px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                          <div style={{ fontSize: 28, fontWeight: 800, color: m.color }}>{m.value}</div>
                          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{m.label}</div>
                          <div style={{ fontSize: 10, color: '#D1D5DB' }}>{m.sub}</div>
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {/* Per-section breakdown */}
                <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                  {t('status.perHour')} — {effectiveSec}
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
                            <span style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>{displayHour(a.hour)} — {displayHour(a.hour + 1)}</span>
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
                        const gwt = parseFloat(((op.va + op.nvan + op.nva) * (1 + op.allowance)).toFixed(2))
                        const mpNeeded = section.taktTime > 0 ? Math.ceil(gwt / section.taktTime) : 1
                        const effCT = parseFloat((gwt / mpNeeded).toFixed(2))
                        const isMultiMP = mpNeeded > 1
                        return (
                          <div key={op.id} style={{
                            padding: '12px 16px',
                            borderBottom: i < section.operations.length - 1 ? '1px solid #F3F4F6' : 'none',
                            background: isMultiMP ? '#EFF6FF' : '#fff',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 14, color: '#374151', flex: 1, marginRight: 8 }}>{i + 1}. {op.name}</span>
                              <span style={{ fontSize: 15, fontWeight: 700, color: '#374151', flexShrink: 0 }}>
                                {gwt}s
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 12, color: '#9CA3AF' }}>
                              <span>Eff CT: {effCT}s</span>
                              {isMultiMP && (
                                <span style={{ color: '#2563EB', fontWeight: 600 }}>MP: {mpNeeded} org</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ─ AI TAB ─ */}
            {tab === 'ai' && (
              <div>
                <div style={{ background: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <span style={{ fontSize: 24 }}>🤖</span>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>AI Rekomendasi</div>
                      <div style={{ fontSize: 13, color: '#9CA3AF' }}>Analisis {effectiveSec} berdasarkan data hari ini</div>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (!section) return
                      setAiLoading(true); setAiResult('')
                      try {
                        const res = await fetch('/api/analytics', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ lineId: selLineId, sectionName: effectiveSec }),
                        })
                        if (res.ok) {
                          const data = await res.json()
                          setAiResult(data.analysis ?? 'Tidak ada hasil.')
                        } else {
                          const d = await res.json()
                          setAiResult(`⚠ ${d.error ?? 'Gagal mendapatkan analisis'}`)
                        }
                      } catch {
                        setAiResult(t('ai.error'))
                      }
                      setAiLoading(false)
                    }}
                    disabled={aiLoading || !section || todayActs.length === 0}
                    style={{
                      width: '100%', height: 52, borderRadius: 14, border: 'none',
                      cursor: (aiLoading || todayActs.length === 0) ? 'not-allowed' : 'pointer',
                      background: aiLoading ? '#E5E7EB' : todayActs.length === 0 ? '#F3F4F6' : '#1D9E75',
                      color: todayActs.length === 0 ? '#9CA3AF' : '#fff',
                      fontSize: 15, fontWeight: 700,
                      boxShadow: (aiLoading || todayActs.length === 0) ? 'none' : '0 4px 12px rgba(29,158,117,0.3)',
                    }}>
                    {aiLoading ? t('ai.analyzing') : todayActs.length === 0 ? t('ai.noData') : t('ai.analyze')}
                  </button>
                </div>

                {aiResult && (
                  <div style={{
                    background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    fontSize: 14, lineHeight: 1.7, color: '#374151',
                  }}>
                    {aiResult.split('\n').map((ln, i) => {
                      if (ln.startsWith('## ')) return <div key={i} style={{ fontSize: 16, fontWeight: 700, color: '#111827', marginTop: i > 0 ? 16 : 0, marginBottom: 6 }}>{ln.replace('## ', '')}</div>
                      if (ln.startsWith('- ')) return <div key={i} style={{ paddingLeft: 12, position: 'relative' as const }}><span style={{ position: 'absolute' as const, left: 0 }}>•</span>{ln.replace('- ', '')}</div>
                      if (ln.trim() === '') return <div key={i} style={{ height: 8 }} />
                      return <div key={i}>{ln}</div>
                    })}
                  </div>
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
                {saving ? t('common.saving') : `✓ Simpan ${displayHour(parseInt(form.hour))} Shift ${shift}`}
              </button>
            </div>
          ) : (
            <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, maxWidth: 480, margin: '0 auto', background: '#fff', borderTop: '1px solid #E5E7EB', display: 'flex' }}>
              {[
                { key: 'status', icon: '◉', label: t('leader.tabStatus') },
                { key: 'input', icon: '✎', label: t('leader.tabInput') },
                { key: 'std', icon: '📋', label: t('leader.tabStandard') },
                { key: 'ai', icon: '<img src="/claude-logo.svg" alt="AI" />', label: t('leader.tabAI') },
              ].map(t => (
                <button key={t.key} onClick={() => setTab(t.key as 'status' | 'input' | 'std' | 'ai')}
                  style={{
                    flex: 1, padding: '10px 4px 14px', border: 'none', cursor: 'pointer',
                    background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                    borderTop: tab === t.key ? '3px solid #1D9E75' : '3px solid transparent',
                  }}>
                  <span style={{ fontSize: 18 }}>{t.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: tab === t.key ? '#1D9E75' : '#9CA3AF' }}>{t.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Watermark TAC */}
      <div style={{ textAlign: 'center', padding: '12px 0 80px', fontSize: 10, color: '#D1D5DB' }}>
        {t('app.by')} <span style={{ fontWeight: 600 }}>Third Axis Center</span>
      </div>
    </div>
  )
}