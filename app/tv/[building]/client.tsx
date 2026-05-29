'use client'
import { useState, useEffect } from 'react'

// ── Types ────────────────────────────────────────────────────
interface LineData {
  id: string
  lineNo: number
  building: string
  assignments: any[]
  actuals: any[]
  alerts: any[]
  dailyTargets?: any[]
}

interface Props {
  building: string
  lines: LineData[]
  sections: string[]
}

// ── Warna ────────────────────────────────────────────────────
const C = {
  bg:      '#0a0e1a',
  card:    '#111827',
  surface: '#1a1f2e',
  border:  '#1f2937',
  green:   '#10b981',
  greenBg: '#052e1c',
  greenBd: '#064e3b',
  amber:   '#f59e0b',
  amberBg: '#2d1f06',
  amberBd: '#78350f',
  red:     '#ef4444',
  redBg:   '#2d0a0a',
  redBd:   '#7f1d1d',
  blue:    '#3b82f6',
  blueBg:  '#172554',
  gray:    '#6b7280',
  white:   '#f9fafb',
  dim:     '#9ca3af',
  teal:    '#1D9E75',
}

// ── Helper: LLER color ───────────────────────────────────────
function llerStyle(ller: number, hasData: boolean) {
  if (!hasData) return { text: C.gray, bg: C.surface, border: C.border }
  if (ller >= 90) return { text: C.green, bg: C.greenBg, border: C.greenBd }
  if (ller >= 75) return { text: C.amber, bg: C.amberBg, border: C.amberBd }
  return              { text: C.red,   bg: C.redBg,   border: C.redBd }
}

// ── Helper: hitung metrik per line ──────────────────────────
function calcLine(line: LineData, sections: string[]) {
  const model   = line.assignments[0]?.model
  const actuals = line.actuals
  const daily   = line.dailyTargets?.[0] ?? null

  if (!model || actuals.length === 0) {
    return {
      model: model?.name ?? null, article: model?.article ?? null,
      imageUrl: model?.imageUrl ?? null, dailyTarget: daily,
      ller: 0, totOut: 0, totTarget: 0, totDT: 0, totDef: 0, avgMP: 0,
      sectionStatus: [] as any[], hasData: false, alerts: line.alerts,
      hourlyOutputs: [] as number[],
    }
  }

  const sectionStatus = sections.map(secName => {
    const sec = model.sections?.find((s: any) => s.name === secName)
    const sa  = actuals.filter((a: any) => a.section?.name === secName)
    if (!sec || sa.length === 0) return { name: secName, ller: null, status: 'nodata' }
    const tph    = sec.taktTime > 0 ? Math.floor(3600 / sec.taktTime) : 0
    const totOut = sa.reduce((s: number, a: any) => s + (a.output ?? 0), 0)
    const totTgt = tph * sa.length
    const ller   = totTgt > 0 ? Math.round((totOut / totTgt) * 100) : 0
    return { name: secName, ller, status: ller >= 90 ? 'good' : ller >= 75 ? 'warn' : 'bad', totOut, totTgt }
  })

  const validSecs = sectionStatus.filter(s => s.status !== 'nodata')
  const avgLler   = validSecs.length > 0
    ? Math.round(validSecs.reduce((s, sec) => s + (sec.ller ?? 0), 0) / validSecs.length) : 0

  const totOut  = actuals.reduce((s: number, a: any) => s + (a.output ?? 0), 0)
  const totDT   = actuals.reduce((s: number, a: any) => s + (a.downtime ?? 0), 0)
  const totDef  = actuals.reduce((s: number, a: any) => s + (a.defect ?? 0), 0)
  const avgMP   = Math.round(actuals.reduce((s: number, a: any) => s + (a.mpActual ?? 0), 0) / actuals.length)

  const firstSec  = model.sections?.find((s: any) => s.taktTime > 0)
  const tphEst    = firstSec ? Math.floor(3600 / firstSec.taktTime) : 100
  const hours     = actuals.map((a: any) => a.hour).sort((a: number, b: number) => a - b)
  const jamCount  = hours.length > 0 ? hours[hours.length - 1] - hours[0] + 1 : 0
  const totTarget = tphEst * jamCount

  // Hourly outputs untuk sparkline (urut per jam, ambil total output per jam)
  const hourMap = new Map<number, number>()
  actuals.forEach((a: any) => hourMap.set(a.hour, (hourMap.get(a.hour) ?? 0) + a.output))
  const hourlyOutputs = Array.from(hourMap.entries()).sort((a, b) => a[0] - b[0]).map(e => e[1])

  return {
    model: model.name, article: model.article, imageUrl: model.imageUrl,
    dailyTarget: daily, ller: avgLler, totOut, totTarget, totDT, totDef, avgMP,
    sectionStatus, hasData: true, alerts: line.alerts, hourlyOutputs,
  }
}

// ── Smart insight (rule-based, bukan AI) ─────────────────────
function genInsight(lineNo: number, bld: string, m: ReturnType<typeof calcLine>): string {
  const p = `L${lineNo}`
  if (!m.hasData) return `${p}: Belum ada data — menunggu input dari Team Leader.`

  // Alert → prioritas utama
  if (m.alerts?.length) {
    const msg = m.alerts[0]?.message ?? 'Alert aktif'
    return `${p}: ⚠ ${msg}. Tindakan segera diperlukan.`
  }

  // Daily target tracking
  if (m.dailyTarget) {
    const pct = Math.round((m.totOut / m.dailyTarget.targetPairs) * 100)
    if (pct >= 100) return `${p}: ✅ Target harian tercapai! Output ${m.totOut.toLocaleString()} dari ${m.dailyTarget.targetPairs.toLocaleString()} pairs (${pct}%).`
    if (pct < 60) return `${p}: 🔴 Target baru ${pct}% (${m.totOut} / ${m.dailyTarget.targetPairs}). Perlu akselerasi output segera.`
  }

  // Trend analysis
  const h = m.hourlyOutputs
  if (h.length >= 3) {
    const last3 = h.slice(-3)
    const trend = last3[2] - last3[0]
    if (trend < -15) return `${p}: 📉 Tren output turun ${Math.abs(trend)} pairs (3 jam terakhir). LLER ${m.ller}%. Investigasi penyebab penurunan.`
    if (trend > 15) return `${p}: 📈 Tren output naik +${trend} pairs. LLER ${m.ller}%. Pertahankan momentum!`
  }

  if (m.totDT > 30) return `${p}: ⏱ Downtime kumulatif ${m.totDT} mnt. LLER ${m.ller}%. Identifikasi root cause segera.`

  const badSecs = m.sectionStatus.filter((s: any) => s.status === 'bad').map((s: any) => s.name)
  if (badSecs.length > 0) return `${p}: Section ${badSecs.join(', ')} LLER di bawah 75%. Fokus perbaikan di section tersebut.`

  if (m.totDef > 0 && m.totOut > 0) {
    const dr = ((m.totDef / m.totOut) * 100).toFixed(1)
    if (parseFloat(dr) > 2) return `${p}: Defect rate ${dr}% (${m.totDef} pairs). LLER ${m.ller}%. Lakukan quality check.`
  }

  if (m.ller >= 90) return `${p}: ✅ LLER ${m.ller}% — lini berjalan efisien. Output ${m.totOut.toLocaleString()} pairs.`
  return `${p}: LLER ${m.ller}% — output ${m.totOut.toLocaleString()} pairs. Pantau terus performa section.`
}

// ── Mini Sparkline component ─────────────────────────────────
function Sparkline({ data, color, height = 28 }: { data: number[]; color: string; height?: number }) {
  if (data.length === 0) return null
  const max = Math.max(...data, 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height }}>
      {data.map((v, i) => (
        <div key={i} style={{
          flex: 1, minWidth: '3px', maxWidth: '8px',
          height: `${Math.max((v / max) * 100, 6)}%`,
          background: i === data.length - 1 ? color : `${color}80`,
          borderRadius: '2px 2px 0 0',
          transition: 'height 0.3s',
        }} />
      ))}
    </div>
  )
}

// ── Progress Bar component ───────────────────────────────────
function ProgressBar({ current, target, color }: { current: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(Math.round((current / target) * 100), 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '6px', background: '#1f2937', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '3px', transition: 'width 0.5s' }} />
      </div>
      <span style={{ fontSize: '12px', fontWeight: 600, color, minWidth: '36px', textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
export default function TVClient({ building, lines, sections }: Props) {
  const [now, setNow]             = useState(new Date())
  const [tickerIdx, setTickerIdx] = useState(0)
  const [fadeIn, setFadeIn]       = useState(true)

  const lineMetrics = lines.map(l => ({ line: l, m: calcLine(l, sections) }))
  const insights    = lineMetrics.map(({ line, m }) => genInsight(line.lineNo, building, m))

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Ticker rotation (6s)
  useEffect(() => {
    if (insights.length <= 1) return
    const t = setInterval(() => {
      setFadeIn(false)
      setTimeout(() => { setTickerIdx(i => (i + 1) % insights.length); setFadeIn(true) }, 400)
    }, 6000)
    return () => clearInterval(t)
  }, [insights.length])

  // Auto-refresh 60s
  useEffect(() => {
    const t = setInterval(() => window.location.reload(), 60000)
    return () => clearInterval(t)
  }, [])

  // Summary
  const withData         = lineMetrics.filter(({ m }) => m.hasData)
  const avgLler          = withData.length > 0 ? Math.round(withData.reduce((s, { m }) => s + m.ller, 0) / withData.length) : 0
  const totalOutput      = lineMetrics.reduce((s, { m }) => s + m.totOut, 0)
  const totalDT          = lineMetrics.reduce((s, { m }) => s + m.totDT, 0)
  const totalAlerts      = lineMetrics.reduce((s, { m }) => s + (m.alerts?.length ?? 0), 0)
  const totalDailyTarget = lineMetrics.reduce((s, { m }) => s + (m.dailyTarget?.targetPairs ?? 0), 0)
  const gColor           = llerStyle(avgLler, withData.length > 0)

  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta' })
  const dateStr = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })

  const cols = lines.length <= 3 ? lines.length : lines.length <= 6 ? 3 : 4

  return (
    <div style={{
      minHeight: '100vh', background: C.bg, color: C.white,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '16px', gap: '12px',
    }}>

      {/* ══ HEADER ══ */}
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
            <div style={{ fontSize: '13px', color: C.dim }}>
              IE Line Balance System · Real-time Production Monitoring
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '28px', fontWeight: 700, color: C.white, fontVariantNumeric: 'tabular-nums' }}>{timeStr}</div>
          <div style={{ fontSize: '12px', color: C.dim }}>{dateStr}</div>
        </div>
      </div>

      {/* ══ KPI SUMMARY ══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
        {[
          { label: 'Avg LLER', value: withData.length > 0 ? `${avgLler}%` : '—', color: gColor.text, bg: gColor.bg, bd: gColor.border },
          { label: 'Total Output', value: `${totalOutput.toLocaleString()}`, color: C.white, bg: C.card, bd: C.border },
          { label: 'Target Harian', value: totalDailyTarget > 0 ? `${totalDailyTarget.toLocaleString()}` : '—', color: C.blue, bg: C.blueBg, bd: '#1e3a5f' },
          { label: 'Downtime', value: `${totalDT} mnt`, color: totalDT > 60 ? C.red : totalDT > 30 ? C.amber : C.white, bg: C.card, bd: C.border },
          { label: 'Alert', value: `${totalAlerts}`, color: totalAlerts > 0 ? C.red : C.green, bg: totalAlerts > 0 ? C.redBg : C.greenBg, bd: totalAlerts > 0 ? C.redBd : C.greenBd },
        ].map((k, i) => (
          <div key={i} style={{ background: k.bg, border: `1px solid ${k.bd}`, borderRadius: '10px', padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: '26px', fontWeight: 700, color: k.color, lineHeight: 1.1 }}>{k.value}</div>
            <div style={{ fontSize: '11px', color: C.dim, marginTop: '4px' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Target progress bar keseluruhan */}
      {totalDailyTarget > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '8px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontSize: '12px', color: C.dim }}>Progress target harian gedung</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: totalOutput >= totalDailyTarget ? C.green : C.amber }}>
              {totalOutput.toLocaleString()} / {totalDailyTarget.toLocaleString()} pairs
            </span>
          </div>
          <ProgressBar current={totalOutput} target={totalDailyTarget} color={totalOutput >= totalDailyTarget ? C.green : C.amber} />
        </div>
      )}

      {/* ══ LINE CARDS GRID ══ */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '10px', flex: 1 }}>
        {lineMetrics.map(({ line, m }) => {
          const col      = llerStyle(m.ller, m.hasData)
          const hasAlert = m.alerts && m.alerts.length > 0
          const dt       = m.dailyTarget

          return (
            <div key={line.id} style={{
              background: C.card, border: `1px solid ${hasAlert ? C.redBd : col.border}`,
              borderRadius: '12px', padding: '14px',
              display: 'flex', flexDirection: 'column', gap: '8px',
              position: 'relative',
              outline: hasAlert ? `2px solid ${C.red}` : 'none',
            }}>
              {/* Alert badge */}
              {hasAlert && (
                <div style={{
                  position: 'absolute', top: '10px', right: '10px',
                  background: C.red, borderRadius: '99px',
                  padding: '2px 8px', fontSize: '11px', fontWeight: 700, color: '#fff',
                  animation: 'pulse 2s infinite',
                }}>⚠ ALERT</div>
              )}

              {/* Line header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {m.imageUrl && (
                  <img src={m.imageUrl} alt={m.model ?? ''}
                    style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '8px', flexShrink: 0, border: `1px solid ${C.border}` }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: C.white }}>
                    Line {line.lineNo}
                    {m.model && <span style={{ fontSize: '12px', color: C.dim, marginLeft: '8px', fontWeight: 400 }}>{m.model}</span>}
                  </div>
                  {m.article && <div style={{ fontSize: '11px', color: C.gray, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.article}</div>}
                </div>
              </div>

              {/* Daily target progress */}
              {dt && (
                <div style={{ background: C.surface, borderRadius: '8px', padding: '8px 10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span style={{ fontSize: '11px', color: C.dim }}>Target harian</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: m.totOut >= dt.targetPairs ? C.green : C.amber }}>
                      {m.totOut} / {dt.targetPairs}
                    </span>
                  </div>
                  <ProgressBar current={m.totOut} target={dt.targetPairs} color={m.totOut >= dt.targetPairs ? C.green : C.amber} />
                </div>
              )}

              {/* LLER + Output — BESAR */}
              <div style={{
                background: col.bg, border: `1px solid ${col.border}`,
                borderRadius: '10px', padding: '12px 14px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: '44px', fontWeight: 700, color: col.text, lineHeight: 1 }}>
                    {m.hasData ? `${m.ller}%` : '—'}
                  </div>
                  <div style={{ fontSize: '12px', color: C.dim, marginTop: '2px' }}>LLER</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: C.white }}>{m.totOut.toLocaleString()}</div>
                  <div style={{ fontSize: '11px', color: C.dim }}>output pairs</div>
                </div>
              </div>

              {/* Sparkline trend per jam */}
              {m.hourlyOutputs.length > 1 && (
                <div style={{ background: C.surface, borderRadius: '8px', padding: '8px 10px' }}>
                  <div style={{ fontSize: '11px', color: C.dim, marginBottom: '4px' }}>Tren output per jam</div>
                  <Sparkline data={m.hourlyOutputs} color={col.text} height={30} />
                </div>
              )}

              {/* Stats: MP, DT, Defect */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                {[
                  { label: 'Avg MP', value: m.hasData ? `${m.avgMP}` : '—', warn: false },
                  { label: 'Downtime', value: m.hasData ? `${m.totDT}m` : '—', warn: m.totDT > 20 },
                  { label: 'Defect', value: m.hasData ? `${m.totDef}` : '—', warn: m.totDef > 0 },
                ].map((s, i) => (
                  <div key={i} style={{ background: C.surface, borderRadius: '6px', padding: '6px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: s.warn ? C.amber : C.white }}>{s.value}</div>
                    <div style={{ fontSize: '10px', color: C.dim }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Section pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {m.sectionStatus.map((sec: any) => {
                  const sc = sec.status === 'good' ? { bg: C.greenBg, text: C.green, bd: C.greenBd }
                    : sec.status === 'warn'         ? { bg: C.amberBg, text: C.amber, bd: C.amberBd }
                    : sec.status === 'bad'          ? { bg: C.redBg,   text: C.red,   bd: C.redBd }
                    :                                 { bg: C.surface,  text: C.gray,  bd: C.border }
                  return (
                    <div key={sec.name} style={{
                      background: sc.bg, border: `1px solid ${sc.bd}`, borderRadius: '99px',
                      padding: '3px 10px', fontSize: '12px', fontWeight: 600, color: sc.text,
                    }}>
                      {sec.name.length > 10 ? sec.name.slice(0, 9) + '…' : sec.name}
                      {sec.ller !== null && ` ${sec.ller}%`}
                    </div>
                  )
                })}
                {!m.hasData && (
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '99px', padding: '3px 10px', fontSize: '12px', color: C.gray }}>
                    Menunggu input
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ══ AUTO INSIGHT TICKER ══ */}
      <div style={{
        background: '#0d1117', border: `1px solid ${C.border}`,
        borderRadius: '10px', padding: '12px 16px',
        display: 'flex', alignItems: 'center', gap: '14px',
        minHeight: '52px',
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #1D9E75, #15803d)',
          borderRadius: '8px', padding: '5px 12px',
          fontSize: '12px', fontWeight: 700, color: '#fff',
          whiteSpace: 'nowrap', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <span style={{ fontSize: '14px' }}>💡</span>
          Auto Insight
        </div>
        <div style={{
          fontSize: '14px', color: C.white, lineHeight: 1.5, flex: 1,
          opacity: fadeIn ? 1 : 0, transition: 'opacity 0.4s ease',
        }}>
          {insights[tickerIdx] ?? 'Mengumpulkan data...'}
        </div>
        <div style={{ flexShrink: 0, display: 'flex', gap: '5px', alignItems: 'center' }}>
          {insights.map((_, i) => (
            <div key={i} style={{
              width: '7px', height: '7px', borderRadius: '50%',
              background: i === tickerIdx ? C.teal : C.border,
              transition: 'background 0.3s',
            }} />
          ))}
        </div>
      </div>

      {/* ══ FOOTER ══ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ fontSize: '11px', color: C.gray }}>
          Auto-refresh 60 detik · {withData.length}/{lines.length} line aktif
        </div>
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
          {[
            { color: C.green, label: 'LLER ≥ 90%' },
            { color: C.amber, label: '75–90%' },
            { color: C.red,   label: '< 75%' },
            { color: C.gray,  label: 'No data' },
          ].map((l, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: C.dim }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: l.color }} />
              {l.label}
            </div>
          ))}
          <span style={{ fontSize: '10px', color: C.gray, opacity: 0.5, marginLeft: '8px' }}>
            by Third Axis Center
          </span>
        </div>
      </div>
    </div>
  )
}
