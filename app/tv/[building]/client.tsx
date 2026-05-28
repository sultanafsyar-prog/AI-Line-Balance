'use client'
import { useState, useEffect, useCallback } from 'react'

// ── Types ────────────────────────────────────────────────────
interface LineData {
  id: string
  lineNo: number
  building: string
  assignments: any[]
  actuals: any[]
  alerts: any[]
}

interface Props {
  building: string
  lines: LineData[]
  sections: string[]
}

// ── Konstanta warna ──────────────────────────────────────────
const C = {
  bg:      '#0a0e1a',
  card:    '#111827',
  border:  '#1f2937',
  green:   '#10b981',
  greenBg: '#052e1c',
  amber:   '#f59e0b',
  amberBg: '#2d1f06',
  red:     '#ef4444',
  redBg:   '#2d0a0a',
  gray:    '#6b7280',
  white:   '#f9fafb',
  dim:     '#9ca3af',
  teal:    '#1D9E75',
}

// ── Helper: hitung metrik per line ──────────────────────────
function calcLineMetrics(line: LineData, sections: string[]) {
  const model    = line.assignments[0]?.model
  const actuals  = line.actuals

  if (!model || actuals.length === 0) {
    return { model: model?.name ?? null, ller: 0, totOut: 0, totTarget: 0, totDT: 0, totDef: 0, avgMP: 0, sectionStatus: [] as any[], hasData: false }
  }

  const sectionStatus = sections.map(secName => {
    const sec        = model.sections?.find((s: any) => s.name === secName)
    const secActuals = actuals.filter((a: any) => a.section?.name === secName)
    if (!sec || secActuals.length === 0) return { name: secName, ller: null, status: 'nodata' }

    const tph      = sec.taktTime > 0 ? Math.floor(3600 / sec.taktTime) : 0
    const totOut   = secActuals.reduce((s: number, a: any) => s + (a.output ?? 0), 0)
    const totTgt   = tph * secActuals.length
    const ller     = totTgt > 0 ? Math.round((totOut / totTgt) * 100) : 0
    const status   = ller >= 90 ? 'good' : ller >= 75 ? 'warn' : 'bad'
    return { name: secName, ller, status, totOut, totTgt }
  })

  // LLER keseluruhan dari semua section yang ada data
  const validSecs  = sectionStatus.filter(s => s.status !== 'nodata')
  const avgLler    = validSecs.length > 0
    ? Math.round(validSecs.reduce((s, sec) => s + (sec.ller ?? 0), 0) / validSecs.length)
    : 0

  const totOut    = actuals.reduce((s: number, a: any) => s + (a.output ?? 0), 0)
  const totDT     = actuals.reduce((s: number, a: any) => s + (a.downtime ?? 0), 0)
  const totDef    = actuals.reduce((s: number, a: any) => s + (a.defect ?? 0), 0)
  const avgMP     = actuals.length
    ? Math.round(actuals.reduce((s: number, a: any) => s + (a.mpActual ?? 0), 0) / actuals.length)
    : 0

  // Estimasi target output: ambil dari section pertama yang ada data
  const firstSec    = model.sections?.find((s: any) => s.taktTime > 0)
  const tphEstimate = firstSec ? Math.floor(3600 / firstSec.taktTime) : 100
  const jamCount    = actuals.length > 0
    ? Math.max(...actuals.map((a: any) => a.hour)) - Math.min(...actuals.map((a: any) => a.hour)) + 1
    : 0
  const totTarget   = tphEstimate * jamCount

  return {
    model:        model.name,
    article:      model.article,
    ller:         avgLler,
    totOut,
    totTarget,
    totDT,
    totDef,
    avgMP,
    sectionStatus,
    hasData:      actuals.length > 0,
    alerts:       line.alerts,
  }
}

// ── Helper: generate insight otomatis (rule-based, tanpa AI call) ──
function genInsight(lineNo: number, building: string, m: ReturnType<typeof calcLineMetrics>): string {
  if (!m.hasData) return `Gdg ${building} Line ${lineNo}: Belum ada data aktual hari ini.`

  const prefix = `Gdg ${building}-L${lineNo} (${m.model ?? '—'})`

  if (m.alerts && m.alerts.length > 0) {
    const alertMsg = (m.alerts[0] as any).message ?? 'Alert aktif'
    return `${prefix}: ⚠ ${alertMsg}`
  }

  if (m.ller >= 90) {
    return `${prefix}: LLER ${m.ller}% — lini berjalan efisien. Output ${m.totOut} pairs.`
  }

  if (m.totDT > 30) {
    return `${prefix}: LLER ${m.ller}% — downtime ${m.totDT} mnt terdeteksi, identifikasi penyebab segera.`
  }

  const badSecs = m.sectionStatus.filter((s: any) => s.status === 'bad').map((s: any) => s.name)
  if (badSecs.length > 0) {
    return `${prefix}: LLER ${m.ller}% — section ${badSecs.join(', ')} perlu perhatian.`
  }

  if (m.totDef > 0 && m.totOut > 0) {
    const dr = ((m.totDef / m.totOut) * 100).toFixed(1)
    return `${prefix}: LLER ${m.ller}% — defect rate ${dr}%, lakukan quality check.`
  }

  return `${prefix}: LLER ${m.ller}% — output ${m.totOut} pairs vs target ${m.totTarget} pairs.`
}

// ── Status color helper ──────────────────────────────────────
function llerColor(ller: number, hasData: boolean) {
  if (!hasData) return { text: C.gray, bg: '#1a1f2e', border: C.border }
  if (ller >= 90) return { text: C.green, bg: C.greenBg, border: '#064e3b' }
  if (ller >= 75) return { text: C.amber, bg: C.amberBg, border: '#78350f' }
  return              { text: C.red,   bg: C.redBg,   border: '#7f1d1d' }
}

// ── Main component ───────────────────────────────────────────
export default function TVClient({ building, lines, sections }: Props) {
  const [now,       setNow]       = useState(new Date())
  const [tickerIdx, setTickerIdx] = useState(0)
  const [fadeIn,    setFadeIn]    = useState(true)

  // Hitung metrik semua line
  const lineMetrics = lines.map(l => ({ line: l, m: calcLineMetrics(l, sections) }))

  // Generate semua insights untuk ticker
  const insights = lineMetrics.map(({ line, m }) => genInsight(line.lineNo, building, m))

  // Clock — update tiap detik
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Ticker — ganti tiap 5 detik
  useEffect(() => {
    const t = setInterval(() => {
      setFadeIn(false)
      setTimeout(() => {
        setTickerIdx(i => (i + 1) % insights.length)
        setFadeIn(true)
      }, 400)
    }, 5000)
    return () => clearInterval(t)
  }, [insights.length])

  // Auto-refresh halaman tiap 60 detik
  useEffect(() => {
    const t = setInterval(() => window.location.reload(), 60000)
    return () => clearInterval(t)
  }, [])

  // Summary gedung
  const linesWithData  = lineMetrics.filter(({ m }) => m.hasData)
  const avgLlerGedung  = linesWithData.length > 0
    ? Math.round(linesWithData.reduce((s, { m }) => s + m.ller, 0) / linesWithData.length)
    : 0
  const totalOutputGedung = lineMetrics.reduce((s, { m }) => s + m.totOut, 0)
  const totalDTGedung     = lineMetrics.reduce((s, { m }) => s + m.totDT, 0)
  const totalAlerts       = lineMetrics.reduce((s, { m }) => s + (m.alerts?.length ?? 0), 0)
  const gedungColor       = llerColor(avgLlerGedung, linesWithData.length > 0)

  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  // Grid columns berdasarkan jumlah line
  const cols = lines.length <= 3 ? lines.length : lines.length <= 6 ? 3 : lines.length <= 8 ? 4 : 3

  return (
    <div style={{
      minHeight: '100vh', background: C.bg, color: C.white,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '16px',
      gap: '12px',
    }}>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '48px', height: '48px', background: C.teal, borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '16px', fontWeight: 700, color: '#fff',
          }}>IE</div>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: C.white, letterSpacing: '-0.5px' }}>
              Gedung {building} — Digital Andon Board
            </div>
            <div style={{ fontSize: '13px', color: C.dim }}>IE Line Balance System · PT. Diamond International Indonesia</div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '28px', fontWeight: 700, color: C.white, fontVariantNumeric: 'tabular-nums' }}>{timeStr}</div>
          <div style={{ fontSize: '12px', color: C.dim }}>{dateStr}</div>
        </div>
      </div>

      {/* ── KPI SUMMARY GEDUNG ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
        {[
          { label: 'Avg LLER Gedung', value: linesWithData.length > 0 ? `${avgLlerGedung}%` : '—', color: gedungColor.text, bg: gedungColor.bg, border: gedungColor.border },
          { label: 'Total Output', value: `${totalOutputGedung.toLocaleString()} pairs`, color: C.white, bg: '#111827', border: C.border },
          { label: 'Total Downtime', value: `${totalDTGedung} mnt`, color: totalDTGedung > 60 ? C.red : totalDTGedung > 30 ? C.amber : C.white, bg: '#111827', border: C.border },
          { label: 'Alert Aktif', value: `${totalAlerts} alert`, color: totalAlerts > 0 ? C.red : C.green, bg: totalAlerts > 0 ? C.redBg : C.greenBg, border: totalAlerts > 0 ? '#7f1d1d' : '#064e3b' },
        ].map((k, i) => (
          <div key={i} style={{
            background: k.bg, border: `1px solid ${k.border}`, borderRadius: '10px',
            padding: '14px 16px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: '12px', color: C.dim, marginTop: '4px' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── GRID SEMUA LINE ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: '10px',
        flex: 1,
      }}>
        {lineMetrics.map(({ line, m }) => {
          const col     = llerColor(m.ller, m.hasData)
          const hasAlert = m.alerts && m.alerts.length > 0

          return (
            <div key={line.id} style={{
              background:   C.card,
              border:       `1px solid ${hasAlert ? '#7f1d1d' : col.border}`,
              borderRadius: '12px',
              padding:      '14px',
              display:      'flex',
              flexDirection:'column',
              gap:          '8px',
              position:     'relative',
              outline:      hasAlert ? `2px solid ${C.red}` : 'none',
            }}>
              {/* Alert indicator */}
              {hasAlert && (
                <div style={{
                  position: 'absolute', top: '10px', right: '10px',
                  background: C.red, borderRadius: '99px',
                  padding: '2px 8px', fontSize: '11px', fontWeight: 700, color: '#fff',
                }}>
                  ⚠ ALERT
                </div>
              )}

              {/* Line header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                {(m as any).imageUrl && (
                  <img src={(m as any).imageUrl} alt={m.model ?? ''}
                    style={{ width: '36px', height: '36px', objectFit: 'cover',
                      borderRadius: '6px', flexShrink: 0, border: '1px solid #1f2937' }} />
                )}
                <div>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: C.white }}>
                    Line {line.lineNo}
                  </span>
                  {m.model && (
                    <span style={{ fontSize: '11px', color: C.dim, marginLeft: '6px' }}>
                      {m.model}
                    </span>
                  )}
                  {(m as any).article && (
                    <div style={{ fontSize: '10px', color: C.gray }}>{(m as any).article}</div>
                  )}
                </div>
              </div>
              {(m as any).dailyTarget && (
                <div style={{
                  background: '#1a1f2e', borderRadius: '6px', padding: '5px 10px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: '6px'
                }}>
                  <span style={{ fontSize: '11px', color: C.dim }}>Target hari ini</span>
                  <span style={{
                    fontSize: '13px', fontWeight: 600,
                    color: m.totOut >= (m as any).dailyTarget.targetPairs ? C.green : C.amber
                  }}>
                    {m.totOut} / {(m as any).dailyTarget.targetPairs} pairs
                  </span>
                </div>
              )}

              {/* LLER besar */}
              <div style={{
                background: col.bg, border: `1px solid ${col.border}`,
                borderRadius: '8px', padding: '10px 14px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: '36px', fontWeight: 700, color: col.text, lineHeight: 1 }}>
                    {m.hasData ? `${m.ller}%` : '—'}
                  </div>
                  <div style={{ fontSize: '11px', color: C.dim, marginTop: '2px' }}>LLER</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '18px', fontWeight: 600, color: C.white }}>{m.totOut}</div>
                  <div style={{ fontSize: '11px', color: C.dim }}>output pairs</div>
                  {m.totTarget > 0 && (
                    <div style={{ fontSize: '11px', color: C.dim }}>target {m.totTarget}</div>
                  )}
                </div>
              </div>

              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                {[
                  { label: 'Avg MP', value: m.hasData ? `${m.avgMP}` : '—' },
                  { label: 'Downtime', value: m.hasData ? `${m.totDT}m` : '—', warn: m.totDT > 20 },
                  { label: 'Defect', value: m.hasData ? `${m.totDef}p` : '—', warn: m.totDef > 0 },
                ].map((s, i) => (
                  <div key={i} style={{
                    background: '#1a1f2e', borderRadius: '6px',
                    padding: '6px 8px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '16px', fontWeight: 600, color: s.warn ? C.amber : C.white }}>{s.value}</div>
                    <div style={{ fontSize: '10px', color: C.dim }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Section status pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {m.sectionStatus.map((sec: any) => {
                  const sc = sec.status === 'good' ? { bg: C.greenBg, text: C.green, border: '#064e3b' }
                    : sec.status === 'warn'         ? { bg: C.amberBg, text: C.amber, border: '#78350f' }
                    : sec.status === 'bad'          ? { bg: C.redBg,   text: C.red,   border: '#7f1d1d' }
                    :                                 { bg: '#1a1f2e',  text: C.gray,  border: C.border }
                  return (
                    <div key={sec.name} style={{
                      background: sc.bg, border: `1px solid ${sc.border}`, borderRadius: '99px',
                      padding: '2px 8px', fontSize: '10px', fontWeight: 500, color: sc.text,
                    }}>
                      {sec.name.length > 8 ? sec.name.slice(0, 7) + '…' : sec.name}
                      {sec.ller !== null && ` ${sec.ller}%`}
                    </div>
                  )
                })}
                {!m.hasData && (
                  <div style={{
                    background: '#1a1f2e', border: `1px solid ${C.border}`,
                    borderRadius: '99px', padding: '2px 10px',
                    fontSize: '10px', color: C.gray,
                  }}>
                    Menunggu input
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── AI TICKER ── */}
      <div style={{
        background: '#0d1117', border: `1px solid ${C.border}`,
        borderRadius: '10px', padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: '12px',
        minHeight: '44px',
      }}>
        <div style={{
          background: C.teal, borderRadius: '6px',
          padding: '3px 10px', fontSize: '11px', fontWeight: 700,
          color: '#fff', whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          AI Insight
        </div>
        <div style={{
          fontSize: '14px', color: C.white, lineHeight: 1.4,
          opacity: fadeIn ? 1 : 0,
          transition: 'opacity 0.4s ease',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {insights[tickerIdx] ?? 'Mengumpulkan data...'}
        </div>
        <div style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', gap: '4px' }}>
          {insights.map((_, i) => (
            <div key={i} style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: i === tickerIdx ? C.teal : C.border,
              transition: 'background 0.3s',
            }} />
          ))}
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '11px', color: C.gray }}>
          Auto-refresh tiap 60 detik · {linesWithData.length} dari {lines.length} line sudah ada data
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {[
            { color: C.green,  label: 'LLER ≥ 90% (Baik)' },
            { color: C.amber,  label: 'LLER 75–90% (Perhatian)' },
            { color: C.red,    label: 'LLER < 75% (Kritis)' },
            { color: C.gray,   label: 'Belum ada data' },
          ].map((l, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: C.dim }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: l.color }} />
              {l.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
