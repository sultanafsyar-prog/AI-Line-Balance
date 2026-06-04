'use client'
import { useState, useEffect } from 'react'
import { useI18n } from '@/lib/i18n'
import LanguageSwitcher from '@/components/LanguageSwitcher'

// ── Types ────────────────────────────────────────────────────
interface LineData {
  id: string
  lineNo: number
  building: string
  lineType: string
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

type ViewMode = 'floor' | 'manager' | 'ie'

// ── Warna ────────────────────────────────────────────────────
const C = {
  bg:       '#0a0e1a',
  card:     '#111827',
  surface:  '#1a1f2e',
  border:   '#1f2937',
  green:    '#10b981',
  greenBg:  '#052e1c',
  greenBd:  '#064e3b',
  amber:    '#f59e0b',
  amberBg:  '#2d1f06',
  amberBd:  '#78350f',
  red:      '#ef4444',
  redBg:    '#2d0a0a',
  redBd:    '#7f1d1d',
  blue:     '#3b82f6',
  blueBg:   '#172554',
  blueBd:   '#1e3a5f',
  gray:     '#6b7280',
  white:    '#f9fafb',
  dim:      '#9ca3af',
  teal:     '#1D9E75',
  tealBg:   '#052e22',
  tealBd:   '#0d4f3c',
}

function statusColors(ller: number, hasData: boolean) {
  if (!hasData) return { text: C.gray,  bg: C.surface, border: C.border,  label: 'NO DATA' }
  if (ller >= 95) return { text: C.green, bg: C.greenBg, border: C.greenBd, label: 'BAIK' }
  if (ller >= 80) return { text: C.amber, bg: C.amberBg, border: C.amberBd, label: 'WARN' }
  return               { text: C.red,   bg: C.redBg,   border: C.redBd,   label: 'KRITIS' }
}

function gapColor(gap: number) {
  if (gap >= 0) return C.green
  if (gap >= -10) return C.amber
  return C.red
}

function getGWT(op: any): number {
  return (op.va + op.nvan + op.nva) * (1 + (op.allowance ?? 0.15))
}

// ── Yamazumi summary per section ─────────────────────────────
interface YamSummary {
  name: string
  taktTime: number
  stdMP: number
  theorMP: number
  maxEffCT: number
}

function calcYamSummaries(model: any, sections: string[]): YamSummary[] {
  if (!model?.sections) return []
  return sections.map(secName => {
    const sec = model.sections.find((s: any) => s.name === secName)
    if (!sec || !sec.taktTime || sec.taktTime <= 0) return null
    const ops = sec.operations ?? []
    if (ops.length === 0) return null
    const totalGWT = ops.reduce((s: number, op: any) => s + getGWT(op), 0)
    const theorMP  = totalGWT / sec.taktTime
    const maxEffCT = ops.reduce((max: number, op: any) => {
      const gwt = getGWT(op)
      const mp  = Math.ceil(gwt / sec.taktTime)
      const eff = gwt / mp
      return eff > max ? eff : max
    }, 0)
    return {
      name: secName, taktTime: sec.taktTime, stdMP: sec.stdMP,
      theorMP: parseFloat(theorMP.toFixed(2)),
      maxEffCT: parseFloat(maxEffCT.toFixed(2)),
    }
  }).filter(Boolean) as YamSummary[]
}

// ── Hitung metrik aktual per line ───────────────────────────
function calcLine(line: LineData, sections: string[]) {
  const model   = line.assignments[0]?.model
  const actuals = line.actuals
  const daily   = line.dailyTargets?.[0] ?? null
  const yamSummaries = model ? calcYamSummaries(model, sections) : []

  const primaryYam =
       yamSummaries.find(y => y.name === 'Stockfit')
    ?? yamSummaries.find(y => y.name === 'Assembly')
    ?? yamSummaries.find(y => y.name === 'Sewing')
    ?? yamSummaries[0] ?? null

  const theoPPH    = primaryYam ? Math.round(3600 / primaryYam.taktTime) : 0
  const taktStd    = primaryYam ? primaryYam.taktTime : 0
  const theoMPTotal = yamSummaries.reduce((s, y) => s + y.theorMP, 0)
  const stdMPTotal  = yamSummaries.reduce((s, y) => s + y.stdMP, 0)

  const baseEmpty = {
    model: model?.name ?? null, article: model?.article ?? null,
    imageUrl: model?.imageUrl ?? null, dailyTarget: daily,
    taktStd, theoPPH,
    theoMPTotal: parseFloat(theoMPTotal.toFixed(2)),
    stdMPTotal,
    ller: 0, lastHourOutput: 0, lastHour: null as number | null, totOut: 0,
    avgPPH: 0, actCT: 0, avgMPActual: 0, gap: 0, totDT: 0, totDef: 0,
    hasData: false, alerts: line.alerts,
    hourlyOutputs: [] as number[],
    yamSummaries, primaryYam,
    sectionActuals: {} as Record<string, { avgMP: number; avgOut: number; lastOut: number; ller: number; mpGap: number }>,
    targetPct: 0, hoursWithData: 0,
  }

  if (!model || actuals.length === 0) return baseEmpty

  // Output line per jam = MAX di antara section pada jam itu (bukan dijumlah)
  const hourMaxOut = new Map<number, number>()
  for (const a of actuals) {
    const cur = hourMaxOut.get(a.hour) ?? 0
    if ((a.output ?? 0) > cur) hourMaxOut.set(a.hour, a.output ?? 0)
  }
  const hourEntries  = Array.from(hourMaxOut.entries()).sort((a, b) => a[0] - b[0])
  const hourlyOutputs = hourEntries.map(([, v]) => v)

  // MP per jam = total MP semua section yang aktif pada jam itu
  const hourMP = new Map<number, number>()
  for (const a of actuals) {
    hourMP.set(a.hour, (hourMP.get(a.hour) ?? 0) + (a.mpActual ?? 0))
  }
  const mpValues = Array.from(hourMP.values())
  const avgMPActual = mpValues.length > 0
    ? mpValues.reduce((s, v) => s + v, 0) / mpValues.length : 0

  const lastEntry      = hourEntries[hourEntries.length - 1]
  const lastHourOutput = lastEntry ? lastEntry[1] : 0
  const lastHour       = lastEntry ? lastEntry[0] : null

  const totOut = hourlyOutputs.reduce((s, v) => s + v, 0)
  const avgPPH = hourlyOutputs.length > 0 ? Math.round(totOut / hourlyOutputs.length) : 0
  const actCT  = avgPPH > 0 ? parseFloat((3600 / avgPPH).toFixed(1)) : 0

  // LLER MP-based
  const ller = avgMPActual > 0 && theoMPTotal > 0
    ? Math.round((theoMPTotal / avgMPActual) * 100) : 0

  const gap = lastHourOutput - theoPPH
  const totDT  = actuals.reduce((s: number, a: any) => s + (a.downtime ?? 0), 0)
  const totDef = actuals.reduce((s: number, a: any) => s + (a.defect ?? 0), 0)

  // Per-section actuals dengan LLER per section
  const sectionActuals: Record<string, { avgMP: number; avgOut: number; lastOut: number; ller: number; mpGap: number }> = {}
  for (const ys of yamSummaries) {
    const sa = actuals.filter((a: any) => a.section?.name === ys.name)
    if (sa.length === 0) continue
    const avgMP   = sa.reduce((s: number, a: any) => s + (a.mpActual ?? 0), 0) / sa.length
    const avgOut  = sa.reduce((s: number, a: any) => s + (a.output ?? 0), 0) / sa.length
    const lastOut = sa.sort((a: any, b: any) => b.hour - a.hour)[0]?.output ?? 0
    const secLler = avgMP > 0 && ys.theorMP > 0 ? Math.round((ys.theorMP / avgMP) * 100) : 0
    sectionActuals[ys.name] = {
      avgMP: parseFloat(avgMP.toFixed(1)),
      avgOut: Math.round(avgOut),
      lastOut, ller: secLler,
      mpGap: parseFloat((avgMP - ys.stdMP).toFixed(1)),
    }
  }

  const targetPct = daily && daily.targetPairs > 0
    ? Math.round((totOut / daily.targetPairs) * 100) : 0

  return {
    ...baseEmpty,
    ller, lastHourOutput, lastHour, totOut,
    avgPPH, actCT,
    avgMPActual: parseFloat(avgMPActual.toFixed(1)),
    gap, totDT, totDef,
    hasData: true, hourlyOutputs, sectionActuals,
    targetPct, hoursWithData: hourEntries.length,
  }
}

// ── Auto insight ─────────────────────────────────────────────
function genInsight(lineNo: number, m: ReturnType<typeof calcLine>): string {
  const p = `L${lineNo}`
  if (!m.hasData) return `${p}: Belum ada data — menunggu input dari Team Leader.`
  if (m.alerts?.length) return `${p}: ⚠ ${m.alerts[0]?.message ?? 'Alert aktif'}. Tindakan segera.`

  if (m.dailyTarget) {
    if (m.targetPct >= 100) return `${p}: ✅ Target harian tercapai! ${m.totOut.toLocaleString()} / ${m.dailyTarget.targetPairs.toLocaleString()} pairs.`
    if (m.targetPct < 60) return `${p}: 🔴 Target baru ${m.targetPct}% (${m.totOut} / ${m.dailyTarget.targetPairs}). Perlu akselerasi.`
  }

  const mpGap = m.avgMPActual - m.theoMPTotal
  if (mpGap > 1.5) return `${p}: 👥 MP ${m.avgMPActual} vs theo ${m.theoMPTotal} (+${mpGap.toFixed(1)}) — overstaffed.`
  if (mpGap < -1.5) return `${p}: 👥 MP ${m.avgMPActual} vs theo ${m.theoMPTotal} (${mpGap.toFixed(1)}) — kekurangan MP.`

  if (m.gap < -15) return `${p}: 📉 Aktual ${m.lastHourOutput} vs target ${m.theoPPH} (gap ${m.gap}). CT ${m.actCT}s vs takt ${m.taktStd}s.`
  if (m.totDT > 30) return `${p}: ⏱ Downtime ${m.totDT} mnt. LLER ${m.ller}%.`
  if (m.ller >= 95) return `${p}: ✅ LLER ${m.ller}% — lini efisien. ${m.totOut.toLocaleString()} pairs.`

  const h = m.hourlyOutputs
  if (h.length >= 3) {
    const trend = h[h.length - 1] - h[h.length - 3]
    if (trend < -15) return `${p}: 📉 Output turun ${Math.abs(trend)} pairs (3 jam terakhir).`
    if (trend > 15)  return `${p}: 📈 Output naik +${trend} pairs. Pertahankan!`
  }
  return `${p}: LLER ${m.ller}% · CT ${m.actCT}s · ${m.totOut.toLocaleString()} pairs.`
}

// ── Sparkline ────────────────────────────────────────────────
function Sparkline({ data, color, height = 18 }: { data: number[]; color: string; height?: number }) {
  if (data.length < 2) return null
  const max = Math.max(...data, 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height }}>
      {data.map((v, i) => (
        <div key={i} style={{
          flex: 1, minWidth: '3px',
          height: `${Math.max((v / max) * 100, 6)}%`,
          background: i === data.length - 1 ? color : `${color}70`,
          borderRadius: '2px 2px 0 0',
        }} />
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════
export default function TVClient({ building, lines, sections }: Props) {
  const [now, setNow]             = useState<Date | null>(null)
  const [tickerIdx, setTickerIdx] = useState(0)
  const [fadeIn, setFadeIn]       = useState(true)
  const [mode, setMode]           = useState<ViewMode>('floor')
  const [autoRotate, setAutoRotate] = useState(true)
  const { t }                     = useI18n()

  const lineMetrics = lines.map(l => ({ line: l, m: calcLine(l, sections) }))
  const insights    = lineMetrics.map(({ line, m }) => genInsight(line.lineNo, m))

  // Clock — initialize only after mount to avoid hydration mismatch
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  // Ticker
  useEffect(() => {
    if (insights.length <= 1) return
    const id = setInterval(() => {
      setFadeIn(false)
      setTimeout(() => { setTickerIdx(i => (i + 1) % insights.length); setFadeIn(true) }, 400)
    }, 6000)
    return () => clearInterval(id)
  }, [insights.length])

  // Auto-rotate mode every 60s
  useEffect(() => {
    if (!autoRotate) return
    const id = setInterval(() => {
      setMode(m => m === 'floor' ? 'manager' : m === 'manager' ? 'ie' : 'floor')
    }, 60000)
    return () => clearInterval(id)
  }, [autoRotate])

  // Page refresh 60s
  useEffect(() => {
    const id = setInterval(() => window.location.reload(), 60000)
    return () => clearInterval(id)
  }, [])

  // Summary
  const withData         = lineMetrics.filter(({ m }) => m.hasData)
  const avgLler          = withData.length > 0
    ? Math.round(withData.reduce((s, { m }) => s + m.ller, 0) / withData.length) : 0
  const totalOutput      = lineMetrics.reduce((s, { m }) => s + m.totOut, 0)
  const totalDT          = lineMetrics.reduce((s, { m }) => s + m.totDT, 0)
  const totalAlerts      = lineMetrics.reduce((s, { m }) => s + (m.alerts?.length ?? 0), 0)
  const totalDailyTarget = lineMetrics.reduce((s, { m }) => s + (m.dailyTarget?.targetPairs ?? 0), 0)
  const bldColor         = statusColors(avgLler, withData.length > 0)

  // Building hours-progress for Manager view
  const maxHours = Math.max(...lineMetrics.map(({ m }) => m.hoursWithData), 0)
  const assumedShiftHours = 8
  const expectedPct = Math.min(Math.round((maxHours / assumedShiftHours) * 100), 100)
  const actualPct = totalDailyTarget > 0 ? Math.round((totalOutput / totalDailyTarget) * 100) : 0
  const onTrackGap = actualPct - expectedPct
  const onTrackStatus =
    onTrackGap >= 0 ? { label: 'ON TRACK', color: C.green, bg: C.greenBg, bd: C.greenBd }
    : onTrackGap >= -10 ? { label: 'CATCHING UP', color: C.amber, bg: C.amberBg, bd: C.amberBd }
    : { label: 'BEHIND TARGET', color: C.red, bg: C.redBg, bd: C.redBd }

  const timeStr = now ? now.toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Jakarta'
  }) : '--:--:--'
  const dateStr = now ? now.toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta'
  }) : '\u00a0'

  // ── HEADER ──
  const Header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '42px', height: '42px', background: C.teal, borderRadius: '10px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '14px', fontWeight: 700, color: '#fff', flexShrink: 0,
        }}>IE</div>
        <div>
          <div style={{ fontSize: '19px', fontWeight: 700, letterSpacing: '-0.4px' }}>
            Gedung {building} — {t('tv.title')}
          </div>
          <div style={{ fontSize: '11px', color: C.dim }}>{t('app.title')} · {t('tv.subtitle')}</div>
        </div>
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          display: 'flex', background: C.card, border: `1px solid ${C.border}`,
          borderRadius: '8px', padding: '3px', gap: '2px',
        }}>
          {(['floor', 'manager', 'ie'] as ViewMode[]).map(vm => {
            const labels = { floor: 'Floor', manager: 'Manager', ie: 'IE' }
            const active = mode === vm
            return (
              <button key={vm}
                onClick={() => { setMode(vm); setAutoRotate(false) }}
                style={{
                  background: active ? C.teal : 'transparent',
                  color: active ? '#fff' : C.dim,
                  border: 'none', cursor: 'pointer',
                  padding: '5px 10px', borderRadius: '5px',
                  fontSize: '11px', fontWeight: 600,
                  transition: 'all 0.2s',
                }}>
                {labels[vm]}
              </button>
            )
          })}
        </div>
        <button
          onClick={() => setAutoRotate(a => !a)}
          title={autoRotate ? 'Pause auto-rotate' : 'Resume auto-rotate'}
          style={{
            background: autoRotate ? C.tealBg : C.card,
            border: `1px solid ${autoRotate ? C.tealBd : C.border}`,
            color: autoRotate ? C.teal : C.dim,
            borderRadius: '6px', padding: '5px 8px',
            fontSize: '10px', cursor: 'pointer', fontWeight: 600,
          }}>
          {autoRotate ? '⟳ AUTO' : '❚❚ PAUSE'}
        </button>
        <LanguageSwitcher dark compact />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{timeStr}</div>
          <div style={{ fontSize: '11px', color: C.dim }}>{dateStr}</div>
        </div>
      </div>
    </div>
  )

  // ── KPI strip (shared) ──
  const KpiStrip = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
      {[
        { label: 'LLER Gedung',  value: withData.length > 0 ? `${avgLler}%` : '—', color: bldColor.text, bg: bldColor.bg, bd: bldColor.border },
        { label: t('tv.totalOutput'), value: totalOutput.toLocaleString(), color: C.white, bg: C.card, bd: C.border },
        { label: t('tv.dailyTarget'), value: totalDailyTarget > 0 ? totalDailyTarget.toLocaleString() : '—', color: C.blue, bg: C.blueBg, bd: C.blueBd },
        { label: t('tv.downtime'), value: `${totalDT} min`, color: totalDT > 60 ? C.red : totalDT > 30 ? C.amber : C.white, bg: C.card, bd: C.border },
        { label: t('tv.alert'), value: `${totalAlerts}`, color: totalAlerts > 0 ? C.red : C.green, bg: totalAlerts > 0 ? C.redBg : C.greenBg, bd: totalAlerts > 0 ? C.redBd : C.greenBd },
      ].map((k, i) => (
        <div key={i} style={{
          background: k.bg, border: `1px solid ${k.bd}`,
          borderRadius: '8px', padding: '9px 12px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: k.color, lineHeight: 1.1 }}>{k.value}</div>
          <div style={{ fontSize: '10px', color: C.dim, marginTop: '3px' }}>{k.label}</div>
        </div>
      ))}
    </div>
  )

  // ── INSIGHT TICKER ──
  const Insight = (
    <div style={{
      background: '#0d1117', border: `1px solid ${C.border}`,
      borderRadius: '8px', padding: '9px 14px',
      display: 'flex', alignItems: 'center', gap: '12px', minHeight: '40px',
    }}>
      <div style={{
        background: `linear-gradient(135deg, ${C.teal}, #15803d)`,
        borderRadius: '6px', padding: '4px 10px',
        fontSize: '11px', fontWeight: 700, color: '#fff',
        whiteSpace: 'nowrap', flexShrink: 0,
      }}>💡 {t('tv.autoInsight')}</div>
      <div style={{
        fontSize: '13px', color: C.white, flex: 1,
        opacity: fadeIn ? 1 : 0, transition: 'opacity 0.4s ease',
      }}>{insights[tickerIdx] ?? t('tv.collecting')}</div>
      <div style={{ flexShrink: 0, display: 'flex', gap: '4px', alignItems: 'center' }}>
        {insights.map((_, i) => (
          <div key={i} style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: i === tickerIdx ? C.teal : C.border,
          }} />
        ))}
      </div>
    </div>
  )

  // ── FOOTER ──
  const Footer = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
      <div style={{ fontSize: '10px', color: C.gray }}>
        Mode: <b style={{ color: C.teal, textTransform: 'uppercase' }}>{mode}</b> · {t('tv.autoRefresh')} · {withData.length}/{lines.length} {t('tv.lineActive')}
      </div>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        {[
          { color: C.green, label: 'LLER ≥ 95%' },
          { color: C.amber, label: '80–94%' },
          { color: C.red,   label: '< 80%' },
          { color: C.gray,  label: 'No data' },
        ].map((l, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: C.dim }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: l.color }} />
            {l.label}
          </div>
        ))}
        <span style={{ fontSize: '10px', color: C.gray, opacity: 0.4, marginLeft: '6px' }}>by Third Axis Center</span>
      </div>
    </div>
  )

  // ════════════════════════════════════════════════════════════
  // MODE: FLOOR (Team Leader) — Big cards, simple status
  // ════════════════════════════════════════════════════════════
  const FloorView = () => {
    const cols = lines.length <= 2 ? lines.length : lines.length <= 4 ? 2 : lines.length <= 6 ? 3 : 4
    return (
      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: '10px', flex: 1,
      }}>
        {lineMetrics.map(({ line, m }) => {
          const sc       = statusColors(m.ller, m.hasData)
          const hasAlert = m.alerts && m.alerts.length > 0
          const mpGapLine = m.avgMPActual - m.theoMPTotal
          return (
            <div key={line.id} style={{
              background: sc.bg, border: `2px solid ${hasAlert ? C.red : sc.border}`,
              borderRadius: '14px', padding: '12px',
              display: 'flex', flexDirection: 'column', gap: '8px',
              position: 'relative', overflow: 'hidden',
            }}>
              {hasAlert && (
                <div style={{
                  position: 'absolute', top: '1px', right: '8px',
                  background: C.red, borderRadius: '88px',
                  padding: '2px 8px', fontSize: '8px', fontWeight: 680, color: '#fff',
                  zIndex: 2,
                }}>⚠ ALERT</div>
              )}

              {/* Line header + status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  fontSize: '44px', fontWeight: 800, color: sc.text,
                  lineHeight: 0.9, fontVariantNumeric: 'tabular-nums',
                }}>{line.lineNo}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '10px', color: C.dim, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Line</div>
                  {m.model ? (
                    <>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: C.white, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.model}</div>
                      <div style={{ fontSize: '10px', color: C.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.article}</div>
                    </>
                  ) : <div style={{ fontSize: '12px', color: C.gray }}>Belum ada model</div>}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: sc.text, lineHeight: 1 }}>
                    {m.hasData ? `${m.ller}%` : '—'}
                  </div>
                  <div style={{
                    background: sc.bg, border: `1px solid ${sc.border}`,
                    borderRadius: '4px', padding: '2px 8px', marginTop: '3px',
                    fontSize: '9px', fontWeight: 700, color: sc.text,
                  }}>{sc.label}</div>
                </div>
              </div>

              {/* Standard vs Aktual comparison table */}
              <div style={{
                background: 'rgba(0,0,0,0.3)', borderRadius: '10px',
                overflow: 'hidden',
              }}>
                {/* Table header */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
                  background: 'rgba(0,0,0,0.3)',
                }}>
                  <div style={{ padding: '5px 8px', fontSize: '9px', fontWeight: 700, color: C.gray, textAlign: 'center' }}></div>
                  <div style={{ padding: '5px 8px', fontSize: '9px', fontWeight: 700, color: C.teal, textAlign: 'center', letterSpacing: '0.5px' }}>STANDARD</div>
                  <div style={{ padding: '5px 8px', fontSize: '9px', fontWeight: 700, color: C.blue, textAlign: 'center', letterSpacing: '0.5px' }}>AKTUAL</div>
                  <div style={{ padding: '5px 8px', fontSize: '9px', fontWeight: 700, color: C.gray, textAlign: 'center', letterSpacing: '0.5px' }}>GAP</div>
                </div>

                {/* PPH row */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
                  borderTop: `1px solid rgba(255,255,255,0.06)`, alignItems: 'center',
                }}>
                  <div style={{ padding: '6px 8px', fontSize: '10px', color: C.dim, fontWeight: 600 }}>PPH</div>
                  <div style={{ padding: '6px 8px', textAlign: 'center' }}>
                    <span style={{ fontSize: '20px', fontWeight: 800, color: C.teal }}>{m.theoPPH || '—'}</span>
                  </div>
                  <div style={{ padding: '6px 8px', textAlign: 'center' }}>
                    <span style={{ fontSize: '20px', fontWeight: 800, color: m.hasData ? C.white : C.gray }}>
                      {m.hasData ? m.lastHourOutput : '—'}
                    </span>
                    {m.lastHour !== null && <div style={{ fontSize: '8px', color: C.gray }}>jam {m.lastHour}</div>}
                  </div>
                  <div style={{ padding: '6px 8px', textAlign: 'center' }}>
                    {m.hasData ? (
                      <span style={{ fontSize: '16px', fontWeight: 700, color: gapColor(m.gap) }}>
                        {m.gap >= 0 ? '+' : ''}{m.gap}
                      </span>
                    ) : <span style={{ color: C.gray }}>—</span>}
                  </div>
                </div>

                {/* Cycle Time row */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
                  borderTop: `1px solid rgba(255,255,255,0.06)`, alignItems: 'center',
                }}>
                  <div style={{ padding: '6px 8px', fontSize: '10px', color: C.dim, fontWeight: 600 }}>CT</div>
                  <div style={{ padding: '6px 8px', textAlign: 'center' }}>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: C.teal }}>
                      {m.taktStd > 0 ? `${m.taktStd}s` : '—'}
                    </span>
                  </div>
                  <div style={{ padding: '6px 8px', textAlign: 'center' }}>
                    {m.hasData && m.actCT > 0 ? (
                      <span style={{
                        fontSize: '16px', fontWeight: 700,
                        color: m.taktStd > 0 && m.actCT <= m.taktStd * 1.1 ? C.green
                             : m.taktStd > 0 && m.actCT <= m.taktStd * 1.3 ? C.amber : C.red,
                      }}>{m.actCT}s</span>
                    ) : <span style={{ color: C.gray }}>—</span>}
                  </div>
                  <div style={{ padding: '6px 8px', textAlign: 'center' }}>
                    {m.hasData && m.actCT > 0 && m.taktStd > 0 ? (
                      <span style={{
                        fontSize: '13px', fontWeight: 600,
                        color: m.actCT <= m.taktStd * 1.1 ? C.green : m.actCT <= m.taktStd * 1.3 ? C.amber : C.red,
                      }}>
                        {m.actCT <= m.taktStd ? '✓' : `+${(m.actCT - m.taktStd).toFixed(1)}s`}
                      </span>
                    ) : <span style={{ color: C.gray }}>—</span>}
                  </div>
                </div>

                {/* MP row */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
                  borderTop: `1px solid rgba(255,255,255,0.06)`, alignItems: 'center',
                }}>
                  <div style={{ padding: '6px 8px', fontSize: '10px', color: C.dim, fontWeight: 600 }}>MP</div>
                  <div style={{ padding: '6px 8px', textAlign: 'center' }}>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: C.teal }}>
                      {m.stdMPTotal > 0 ? m.stdMPTotal : '—'}
                    </span>
                    {m.theoMPTotal > 0 && m.theoMPTotal !== m.stdMPTotal && (
                      <span style={{ fontSize: '9px', color: C.gray, marginLeft: '3px' }}>({m.theoMPTotal})</span>
                    )}
                  </div>
                  <div style={{ padding: '6px 8px', textAlign: 'center' }}>
                    <span style={{ fontSize: '16px', fontWeight: 700, color: m.hasData ? C.white : C.gray }}>
                      {m.hasData ? m.avgMPActual : '—'}
                    </span>
                  </div>
                  <div style={{ padding: '6px 8px', textAlign: 'center' }}>
                    {m.hasData && Math.abs(mpGapLine) > 0.3 ? (
                      <span style={{
                        fontSize: '13px', fontWeight: 600,
                        color: mpGapLine > 1 ? C.amber : mpGapLine < -1 ? C.red : C.dim,
                      }}>
                        {mpGapLine > 0 ? '+' : ''}{mpGapLine.toFixed(1)}
                      </span>
                    ) : m.hasData ? <span style={{ fontSize: '13px', color: C.green }}>✓</span> : <span style={{ color: C.gray }}>—</span>}
                  </div>
                </div>
              </div>

              {/* Section breakdown */}
              {m.yamSummaries.length > 0 && m.hasData && (
                <div style={{
                  background: 'rgba(0,0,0,0.2)', borderRadius: '8px',
                  padding: '6px 8px',
                }}>
                  <div style={{ fontSize: '9px', color: C.dim, fontWeight: 700, marginBottom: '4px', letterSpacing: '0.5px' }}>
                    SECTION — STD MP / ACT MP / LLER
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {m.yamSummaries.map(ys => {
                      const act = m.sectionActuals[ys.name]
                      const secSc = act ? statusColors(act.ller, true) : statusColors(0, false)
                      return (
                        <div key={ys.name} style={{
                          background: act ? secSc.bg : 'rgba(0,0,0,0.3)',
                          border: `1px solid ${act ? secSc.border : C.border}`,
                          borderRadius: '5px', padding: '3px 6px',
                          fontSize: '9px', color: C.dim,
                          display: 'flex', gap: '4px', alignItems: 'center',
                        }}>
                          <span style={{ color: C.white, fontWeight: 600, fontSize: '9px' }}>{ys.name.slice(0, 4)}</span>
                          <span style={{ color: C.teal, fontWeight: 700 }}>{ys.stdMP}</span>
                          <span style={{ color: C.gray }}>/</span>
                          <span style={{ color: act ? C.white : C.gray, fontWeight: 600 }}>{act ? act.avgMP : '—'}</span>
                          {act && (
                            <>
                              <span style={{ color: C.gray }}>·</span>
                              <span style={{ color: secSc.text, fontWeight: 700 }}>{act.ller}%</span>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Daily target + downtime/defect row */}
              <div style={{ display: 'grid', gridTemplateColumns: m.dailyTarget ? '1fr auto' : '1fr', gap: '8px', alignItems: 'end' }}>
                {m.dailyTarget && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <span style={{ fontSize: '9px', color: C.dim }}>TARGET HARI INI</span>
                      <span style={{ fontSize: '10px', fontWeight: 600, color: m.targetPct >= 100 ? C.green : C.amber }}>
                        {m.totOut.toLocaleString()} / {m.dailyTarget.targetPairs.toLocaleString()} ({m.targetPct}%)
                      </span>
                    </div>
                    <div style={{ height: '5px', background: C.border, borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', width: `${Math.min(m.targetPct, 100)}%`,
                        background: m.targetPct >= 100 ? C.green : C.amber, borderRadius: '3px',
                      }} />
                    </div>
                  </div>
                )}
                {m.hasData && (m.totDT > 0 || m.totDef > 0) && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {m.totDT > 0 && (
                      <div style={{
                        background: m.totDT > 30 ? C.redBg : 'rgba(0,0,0,0.2)',
                        border: `1px solid ${m.totDT > 30 ? C.redBd : C.border}`,
                        borderRadius: '5px', padding: '3px 7px', textAlign: 'center',
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: m.totDT > 30 ? C.red : C.amber, lineHeight: 1 }}>{m.totDT}</div>
                        <div style={{ fontSize: '8px', color: C.dim }}>DT min</div>
                      </div>
                    )}
                    {m.totDef > 0 && (
                      <div style={{
                        background: 'rgba(0,0,0,0.2)', border: `1px solid ${C.border}`,
                        borderRadius: '5px', padding: '3px 7px', textAlign: 'center',
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: C.amber, lineHeight: 1 }}>{m.totDef}</div>
                        <div style={{ fontSize: '8px', color: C.dim }}>Defect</div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Sparkline tren */}
              {m.hourlyOutputs.length > 1 && (
                <div>
                  <div style={{ fontSize: '9px', color: C.dim, marginBottom: '3px' }}>TREN OUTPUT/JAM · avg {m.avgPPH} prs</div>
                  <Sparkline data={m.hourlyOutputs} color={sc.text} height={20} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════
  // MODE: MANAGER — Big banner + sorted line list (issues first)
  // ════════════════════════════════════════════════════════════
  const ManagerView = () => {
    // Sort: alerts first, then critical LLER, then warn, then good, no-data last
    const sortedLines = [...lineMetrics].sort((a, b) => {
      const sev = (x: typeof a) => {
        if (!x.m.hasData) return 5
        if (x.m.alerts.length > 0) return 0
        if (x.m.ller < 80) return 1
        if (x.m.ller < 95) return 2
        return 3
      }
      return sev(a) - sev(b)
    })

    const issuesCount = lineMetrics.filter(({ m }) => m.hasData && (m.alerts.length > 0 || m.ller < 80)).length

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: 0 }}>
        {/* BIG STATUS BANNER */}
        <div style={{
          background: onTrackStatus.bg, border: `2px solid ${onTrackStatus.bd}`,
          borderRadius: '12px', padding: '16px 20px',
          display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', gap: '20px', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '11px', color: C.dim, textTransform: 'uppercase', letterSpacing: '1px' }}>
              Status Gedung {building}
            </div>
            <div style={{ fontSize: '32px', fontWeight: 800, color: onTrackStatus.color, lineHeight: 1.1, marginTop: '4px' }}>
              {onTrackStatus.label}
            </div>
            <div style={{ fontSize: '12px', color: C.dim, marginTop: '4px' }}>
              {onTrackGap >= 0
                ? `+${onTrackGap}% di atas ekspektasi waktu`
                : `${onTrackGap}% di bawah ekspektasi waktu`}
            </div>
          </div>

          <div style={{ width: '1px', background: C.border, height: '60px' }} />

          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '44px', fontWeight: 800, color: C.white, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {actualPct}%
              </span>
              <span style={{ fontSize: '14px', color: C.dim }}>dari target</span>
            </div>
            <div style={{ fontSize: '11px', color: C.dim, marginTop: '4px' }}>
              {totalOutput.toLocaleString()} / {totalDailyTarget.toLocaleString()} pairs
            </div>
            <div style={{ marginTop: '8px', height: '8px', background: C.border, borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
              <div style={{ height: '100%', width: `${Math.min(actualPct, 100)}%`, background: onTrackStatus.color, borderRadius: '4px' }} />
              {/* Expected marker */}
              <div style={{
                position: 'absolute', top: '-2px', left: `${Math.min(expectedPct, 100)}%`,
                width: '2px', height: '12px', background: C.white,
              }} title={`Expected: ${expectedPct}%`} />
            </div>
            <div style={{ fontSize: '10px', color: C.gray, marginTop: '3px' }}>
              Marker putih = ekspektasi pada jam ke-{maxHours}
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '40px', fontWeight: 800,
              color: issuesCount > 0 ? C.red : C.green, lineHeight: 1,
            }}>
              {issuesCount}
            </div>
            <div style={{ fontSize: '11px', color: C.dim, marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Line bermasalah
            </div>
          </div>
        </div>

        {/* COMPACT LINE LIST */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: '10px', overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '60px 1.5fr 1fr 110px 80px 90px',
            padding: '8px 14px', gap: '10px',
            borderBottom: `1px solid ${C.border}`, background: '#0d1117',
          }}>
            {['LINE', 'MODEL', 'PROGRESS TARGET', 'OUTPUT', 'LLER', 'STATUS'].map((h, i) => (
              <div key={i} style={{
                fontSize: '10px', fontWeight: 700, color: C.teal,
                textTransform: 'uppercase', letterSpacing: '0.5px',
                textAlign: i === 0 || i === 4 || i === 5 ? 'center' : 'left',
              }}>{h}</div>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {sortedLines.map(({ line, m }, idx) => {
              const sc = statusColors(m.ller, m.hasData)
              const hasAlert = m.alerts.length > 0
              const isIssue = m.hasData && (hasAlert || m.ller < 80)
              return (
                <div key={line.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '60px 1.5fr 1fr 110px 80px 90px',
                  padding: '12px 14px', gap: '10px', alignItems: 'center',
                  borderBottom: `1px solid ${C.border}`,
                  background: isIssue ? 'rgba(239,68,68,0.08)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                }}>
                  <div style={{
                    textAlign: 'center', fontSize: '24px', fontWeight: 800, color: sc.text,
                  }}>{line.lineNo}</div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: C.white, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m.model ?? '—'}
                    </div>
                    <div style={{ fontSize: '10px', color: C.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m.article ?? '—'}
                    </div>
                  </div>

                  <div>
                    {m.dailyTarget ? (
                      <>
                        <div style={{ fontSize: '11px', color: C.dim, marginBottom: '4px' }}>
                          {m.totOut.toLocaleString()}/{m.dailyTarget.targetPairs.toLocaleString()} · <b style={{ color: m.targetPct >= 100 ? C.green : C.amber }}>{m.targetPct}%</b>
                        </div>
                        <div style={{ height: '6px', background: C.border, borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(m.targetPct, 100)}%`,
                            background: m.targetPct >= 100 ? C.green : m.targetPct >= 60 ? C.amber : C.red,
                            borderRadius: '3px',
                          }} />
                        </div>
                      </>
                    ) : <span style={{ fontSize: '11px', color: C.gray }}>Belum ada target</span>}
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    {m.hasData ? (
                      <>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: sc.text }}>{m.lastHourOutput}/{m.theoPPH}</div>
                        <div style={{ fontSize: '10px', color: gapColor(m.gap) }}>
                          {m.gap >= 0 ? '+' : ''}{m.gap}/jam
                        </div>
                      </>
                    ) : <span style={{ color: C.gray }}>—</span>}
                  </div>

                  <div style={{
                    fontSize: '22px', fontWeight: 700, color: sc.text, textAlign: 'center',
                  }}>{m.hasData ? `${m.ller}%` : '—'}</div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      display: 'inline-block',
                      background: sc.bg, border: `1px solid ${sc.border}`,
                      borderRadius: '6px', padding: '4px 10px',
                      fontSize: '11px', fontWeight: 700, color: sc.text,
                    }}>
                      {hasAlert ? '⚠ ALERT' : sc.label}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════
  // MODE: IE — Detailed Std vs Aktual table + section LLER
  // ════════════════════════════════════════════════════════════
  const IEView = () => {
    const gridTemplate = `60px 1.4fr 65px 55px 65px 60px  65px 55px 65px 75px  85px 80px`
    return (
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: '10px', overflow: 'hidden',
        flex: 1, display: 'flex', flexDirection: 'column',
      }}>
        {/* Group labels */}
        <div style={{
          display: 'grid', gridTemplateColumns: gridTemplate,
          padding: '6px 12px 0', gap: '6px', background: '#0d1117',
        }}>
          <div></div><div></div>
          <div style={{
            gridColumn: 'span 4', background: C.tealBg, border: `1px solid ${C.tealBd}`,
            borderBottom: 'none', borderRadius: '6px 6px 0 0', padding: '3px 8px',
            fontSize: '10px', fontWeight: 700, color: C.teal, textAlign: 'center', letterSpacing: '0.8px',
          }}>── STANDARD (YAMAZUMI IE) ──</div>
          <div style={{
            gridColumn: 'span 4', background: C.blueBg, border: `1px solid ${C.blueBd}`,
            borderBottom: 'none', borderRadius: '6px 6px 0 0', padding: '3px 8px',
            fontSize: '10px', fontWeight: 700, color: C.blue, textAlign: 'center', letterSpacing: '0.8px',
          }}>── AKTUAL (PRODUKSI) ──</div>
          <div></div><div></div>
        </div>

        {/* Column labels */}
        <div style={{
          display: 'grid', gridTemplateColumns: gridTemplate,
          padding: '6px 12px', gap: '6px',
          borderBottom: `1px solid ${C.border}`, background: '#0d1117',
        }}>
          {[
            { label: 'Line',    align: 'center', color: C.gray },
            { label: 'Model',   align: 'left',   color: C.gray },
            { label: 'Takt',    align: 'center', color: C.teal },
            { label: 'Std MP',  align: 'center', color: C.teal },
            { label: 'Theo MP', align: 'center', color: C.teal },
            { label: 'PPH',     align: 'center', color: C.teal },
            { label: 'MP',      align: 'center', color: C.blue },
            { label: 'CT',      align: 'center', color: C.blue },
            { label: 'PPH',     align: 'center', color: C.blue },
            { label: 'Total',   align: 'center', color: C.blue },
            { label: 'LLER',    align: 'center', color: C.gray },
            { label: 'Status',  align: 'center', color: C.gray },
          ].map((col, i) => (
            <div key={i} style={{
              fontSize: '10px', fontWeight: 700, color: col.color,
              textTransform: 'uppercase', letterSpacing: '0.5px',
              textAlign: col.align as any,
            }}>{col.label}</div>
          ))}
        </div>

        {/* Rows */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {lineMetrics.map(({ line, m }, rowIdx) => {
            const sc = statusColors(m.ller, m.hasData)
            const hasAlert = m.alerts && m.alerts.length > 0
            const dt = m.dailyTarget
            const rowBg = rowIdx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'
            const mpGapLine = m.avgMPActual - m.theoMPTotal

            return (
              <div key={line.id} style={{
                borderBottom: `1px solid ${C.border}`,
                background: hasAlert ? 'rgba(239,68,68,0.05)' : rowBg,
              }}>
                {/* Main row */}
                <div style={{
                  display: 'grid', gridTemplateColumns: gridTemplate,
                  padding: '10px 12px', gap: '6px', alignItems: 'center',
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: '38px', height: '38px',
                      background: sc.bg, border: `1px solid ${sc.border}`,
                      borderRadius: '8px', fontSize: '16px', fontWeight: 700, color: sc.text,
                    }}>{line.lineNo}</div>
                    {hasAlert && <div style={{ fontSize: '9px', color: C.red, marginTop: '2px', fontWeight: 700 }}>⚠</div>}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    {m.model ? (
                      <>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: C.white, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.model}</div>
                        <div style={{ fontSize: '10px', color: C.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.article ?? '—'}</div>
                        {dt && (
                          <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <div style={{ flex: 1, height: '3px', background: C.border, borderRadius: '2px', overflow: 'hidden' }}>
                              <div style={{
                                height: '100%', width: `${Math.min(m.targetPct, 100)}%`,
                                background: m.targetPct >= 100 ? C.green : C.amber, borderRadius: '2px',
                              }} />
                            </div>
                            <span style={{ fontSize: '10px', color: C.dim, whiteSpace: 'nowrap' }}>
                              {m.totOut.toLocaleString()}/{dt.targetPairs.toLocaleString()}
                            </span>
                          </div>
                        )}
                      </>
                    ) : <span style={{ fontSize: '12px', color: C.gray }}>—</span>}
                  </div>

                  {/* STANDARD */}
                  <div style={{ textAlign: 'center' }}>
                    {m.taktStd > 0 ? <div style={{ fontSize: '17px', fontWeight: 700, color: C.teal }}>{m.taktStd}<span style={{ fontSize: '10px', color: C.dim }}>s</span></div> : <span style={{ color: C.gray }}>—</span>}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    {m.stdMPTotal > 0 ? <div style={{ fontSize: '17px', fontWeight: 700, color: C.teal }}>{m.stdMPTotal}</div> : <span style={{ color: C.gray }}>—</span>}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    {m.theoMPTotal > 0 ? <div style={{ fontSize: '17px', fontWeight: 700, color: C.teal }}>{m.theoMPTotal}</div> : <span style={{ color: C.gray }}>—</span>}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    {m.theoPPH > 0 ? (<><div style={{ fontSize: '17px', fontWeight: 700, color: C.teal }}>{m.theoPPH}</div><div style={{ fontSize: '9px', color: C.gray }}>prs/jam</div></>) : <span style={{ color: C.gray }}>—</span>}
                  </div>

                  {/* AKTUAL */}
                  <div style={{ textAlign: 'center' }}>
                    {m.hasData ? (
                      <>
                        <div style={{ fontSize: '17px', fontWeight: 700, color: C.white }}>{m.avgMPActual}</div>
                        {Math.abs(mpGapLine) > 0.5 && (
                          <div style={{ fontSize: '9px', color: mpGapLine < 0 ? C.red : C.amber, fontWeight: 600 }}>
                            {mpGapLine > 0 ? '+' : ''}{mpGapLine.toFixed(1)}
                          </div>
                        )}
                      </>
                    ) : <span style={{ color: C.gray }}>—</span>}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    {m.hasData && m.actCT > 0 ? (
                      <div style={{
                        fontSize: '17px', fontWeight: 700,
                        color: m.taktStd > 0 && m.actCT <= m.taktStd * 1.1 ? C.green
                             : m.taktStd > 0 && m.actCT <= m.taktStd * 1.3 ? C.amber : C.red,
                      }}>{m.actCT}<span style={{ fontSize: '10px', color: C.dim }}>s</span></div>
                    ) : <span style={{ color: C.gray }}>—</span>}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    {m.hasData ? (
                      <>
                        <div style={{ fontSize: '17px', fontWeight: 700, color: sc.text }}>{m.lastHourOutput}</div>
                        <div style={{ fontSize: '9px', color: C.gray }}>
                          gap <span style={{ color: gapColor(m.gap), fontWeight: 600 }}>{m.gap >= 0 ? '+' : ''}{m.gap}</span>
                        </div>
                      </>
                    ) : <span style={{ color: C.gray }}>—</span>}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    {m.hasData ? (
                      <>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: C.white }}>{m.totOut.toLocaleString()}</div>
                        {m.hourlyOutputs.length > 1 && (
                          <div style={{ marginTop: '2px' }}><Sparkline data={m.hourlyOutputs} color={sc.text} /></div>
                        )}
                      </>
                    ) : <span style={{ color: C.gray }}>—</span>}
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: sc.text, lineHeight: 1 }}>
                      {m.hasData ? `${m.ller}%` : '—'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      display: 'inline-block',
                      background: sc.bg, border: `1px solid ${sc.border}`,
                      borderRadius: '6px', padding: '4px 10px',
                      fontSize: '11px', fontWeight: 700, color: sc.text,
                    }}>{sc.label}</div>
                  </div>
                </div>

                {/* Section chips with LLER per section */}
                {m.yamSummaries.length > 0 && (
                  <div style={{
                    padding: '0 12px 8px',
                    display: 'flex', gap: '5px', flexWrap: 'wrap',
                  }}>
                    {m.yamSummaries.map(ys => {
                      const act = m.sectionActuals[ys.name]
                      const secSc = act ? statusColors(act.ller, true) : statusColors(0, false)
                      return (
                        <div key={ys.name} style={{
                          background: act ? secSc.bg : C.bg,
                          border: `1px solid ${act ? secSc.border : C.border}`,
                          borderRadius: '6px', padding: '4px 9px',
                          fontSize: '10px', color: C.dim,
                          display: 'flex', gap: '8px', alignItems: 'center',
                        }}>
                          <span style={{ color: C.white, fontWeight: 600, minWidth: '54px' }}>{ys.name}</span>
                          <span>Takt <b style={{ color: C.teal }}>{ys.taktTime}s</b></span>
                          <span>MP <b style={{ color: C.teal }}>{ys.stdMP}</b>/<b style={{ color: act ? C.white : C.gray }}>{act ? act.avgMP : '—'}</b>
                            {act && Math.abs(act.mpGap) > 0.5 && (
                              <span style={{ color: act.mpGap < 0 ? C.red : C.amber, fontWeight: 600, marginLeft: '2px' }}>
                                ({act.mpGap > 0 ? '+' : ''}{act.mpGap})
                              </span>
                            )}
                          </span>
                          <span>Theo <b style={{ color: C.amber }}>{ys.theorMP}</b></span>
                          {act && (
                            <span>LLER <b style={{ color: secSc.text }}>{act.ller}%</b></span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════
  return (
    <div style={{
      minHeight: '100vh', background: C.bg, color: C.white,
      display: 'flex', flexDirection: 'column',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '12px', gap: '10px',
    }}>
      {Header}
      {KpiStrip}
      {mode === 'floor' && <FloorView />}
      {mode === 'manager' && <ManagerView />}
      {mode === 'ie' && <IEView />}
      {Insight}
      {Footer}
    </div>
  )
}