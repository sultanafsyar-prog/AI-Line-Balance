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

type ViewMode = 'floor' | 'manager' | 'ie' | 'ai'

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
  teal:     '#3B82F6',
  tealBg:   '#052e22',
  tealBd:   '#0d4f3c',
}

function statusColors(ller: number, hasData: boolean) {
  if (!hasData) return { text: C.gray,  bg: C.surface, border: C.border,  label: 'tv.stNoData' }
  if (ller >= 95) return { text: C.green, bg: C.greenBg, border: C.greenBd, label: 'tv.stGood' }
  if (ller >= 80) return { text: C.amber, bg: C.amberBg, border: C.amberBd, label: 'tv.stWarn' }
  return               { text: C.red,   bg: C.redBg,   border: C.redBd,   label: 'tv.stCritical' }
}

function gapColor(gap: number) {
  if (gap >= 0) return C.green
  if (gap >= -10) return C.amber
  return C.red
}

function getGWT(op: any): number {
  return (op.va + op.nvan + op.nva) * (1 + (op.allowance ?? 0.15))
}

// ── Per-line accent colors for visual differentiation ──────
const LINE_ACCENTS = [
  { accent: '#3b82f6', accentBg: 'rgba(59,130,246,0.08)',  accentBd: 'rgba(59,130,246,0.25)',  stripe: 'rgba(59,130,246,0.04)'  },  // blue
  { accent: '#8b5cf6', accentBg: 'rgba(139,92,246,0.08)',  accentBd: 'rgba(139,92,246,0.25)',  stripe: 'rgba(139,92,246,0.04)'  },  // violet
  { accent: '#06b6d4', accentBg: 'rgba(6,182,212,0.08)',   accentBd: 'rgba(6,182,212,0.25)',   stripe: 'rgba(6,182,212,0.04)'   },  // cyan
  { accent: '#f97316', accentBg: 'rgba(249,115,22,0.08)',  accentBd: 'rgba(249,115,22,0.25)',  stripe: 'rgba(249,115,22,0.04)'  },  // orange
  { accent: '#ec4899', accentBg: 'rgba(236,72,153,0.08)',  accentBd: 'rgba(236,72,153,0.25)',  stripe: 'rgba(236,72,153,0.04)'  },  // pink
  { accent: '#14b8a6', accentBg: 'rgba(20,184,166,0.08)',  accentBd: 'rgba(20,184,166,0.25)',  stripe: 'rgba(20,184,166,0.04)'  },  // teal
  { accent: '#eab308', accentBg: 'rgba(234,179,8,0.08)',   accentBd: 'rgba(234,179,8,0.25)',   stripe: 'rgba(234,179,8,0.04)'   },  // yellow
]

// ── Yamazumi summary per section ─────────────────────────────
interface YamSummary {
  name: string
  taktTime: number
  stdMP: number
  theorMP: number
  maxEffCT: number
  hourlyTarget: number | null
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
      theorMP: parseFloat(theorMP.toFixed(1)),
      maxEffCT: parseFloat(maxEffCT.toFixed(1)),
      hourlyTarget: sec.hourlyTarget ?? null,
    }
  }).filter(Boolean) as YamSummary[]
}

// ── Hitung metrik aktual per line ───────────────────────────
//
// PENTING — KONSEP IE:
// Di Building G (Stockfit area), setiap LINE fisik = SATU section
// (Buffing line, UV line, Stockfit line — operatornya beda total: 12/5/43).
// Maka untuk Building G, standard MP / theo MP / takt / PPH HARUS dari
// section yang dijalankan line itu saja, BUKAN jumlah semua section.
//
// Di building lain (sewing/assembly), satu line menjalankan semua section
// secara berurutan, jadi sum across sections = total line yang benar.
//
// Deteksi section aktif Building G: section dengan total output terbesar
// dari actuals hari ini. Kalau belum ada actuals, fallback ke 'Stockfit'
// (mayoritas line di gedung G adalah Stockfit).
function calcLine(line: LineData, sections: string[], building: string) {
  const model   = line.assignments[0]?.model
  const actuals = line.actuals
  const daily   = line.dailyTargets?.[0] ?? null
  const yamSummaries = model ? calcYamSummaries(model, sections) : []

  // ─── ACTIVE SECTION DETECTION (Building G only) ──────────
  const isStockfitBuilding = building === 'G'
  let activeSection: string | null = null
  if (isStockfitBuilding && yamSummaries.length > 0) {
    if (actuals.length > 0) {
      const sumByName = new Map<string, number>()
      for (const a of actuals) {
        const sn = a.section?.name
        if (!sn) continue
        sumByName.set(sn, (sumByName.get(sn) ?? 0) + (a.output ?? 0) + (a.mpActual ?? 0))
      }
      let best = '', bestVal = -1
      for (const [sn, val] of sumByName) {
        if (val > bestVal) { best = sn; bestVal = val }
      }
      // Hanya pakai hasil deteksi kalau memang section itu ada di yamSummaries
      if (best && yamSummaries.some(y => y.name === best)) activeSection = best
    }
    // Fallback: Stockfit kalau ada di yamSummaries, kalau tidak ambil yamSummaries pertama
    if (!activeSection) {
      activeSection = yamSummaries.find(y => y.name === 'Stockfit')?.name
        ?? yamSummaries[0]?.name
        ?? null
    }
  }

  // ─── PILIH yamSummary REFERENSI ───────────────────────────
  const activeYam = activeSection
    ? yamSummaries.find(y => y.name === activeSection) ?? null
    : null

  const primaryYam = activeYam ?? (
       yamSummaries.find(y => y.name === 'Stockfit')
    ?? yamSummaries.find(y => y.name === 'Assembly')
    ?? yamSummaries.find(y => y.name === 'Sewing')
    ?? yamSummaries[0] ?? null
  )

  const theoPPH = primaryYam ? Math.round(3600 / primaryYam.taktTime) : 0
  // Target tampilan per jam: pakai target manual IE kalau di-set, else teoretis
  const dispTPH = primaryYam?.hourlyTarget ?? theoPPH
  const taktStd = primaryYam ? primaryYam.taktTime : 0

  // STD MP / THEO MP — section-only kalau activeSection set
  const theoMPTotal = activeYam
    ? activeYam.theorMP
    : yamSummaries.reduce((s, y) => s + y.theorMP, 0)
  const stdMPTotal = activeYam
    ? activeYam.stdMP
    : parseFloat(yamSummaries.reduce((s, y) => s + y.stdMP, 0).toFixed(1))

  const baseEmpty = {
    model: model?.name ?? null, article: model?.article ?? null,
    imageUrl: model?.imageUrl ?? null, dailyTarget: daily,
    taktStd, theoPPH, dispTPH,
    theoMPTotal: parseFloat(theoMPTotal.toFixed(1)),
    stdMPTotal,
    ller: 0, lastHourOutput: 0, lastHour: null as number | null, totOut: 0,
    avgPPH: 0, actCT: 0, avgMPActual: 0, gap: 0, totDT: 0, totDef: 0,
    hasData: false, alerts: line.alerts,
    hourlyOutputs: [] as number[],
    yamSummaries, primaryYam,
    sectionActuals: {} as Record<string, { avgMP: number; avgOut: number; lastOut: number; ller: number; mpGap: number }>,
    targetPct: 0, hoursWithData: 0,
    activeSection,
  }

  if (!model || actuals.length === 0) return baseEmpty

  // ─── FILTER ACTUALS ke section aktif (untuk Building G) ───
  const relevantActuals = activeSection
    ? actuals.filter((a: any) => a.section?.name === activeSection)
    : actuals

  // Output per jam:
  // - activeSection set: langsung ambil output section itu per jam
  // - tidak: ambil MAX antar section per jam (bukan dijumlah, hindari double-count)
  const hourOut = new Map<number, number>()
  if (activeSection) {
    for (const a of relevantActuals) {
      hourOut.set(a.hour, (hourOut.get(a.hour) ?? 0) + (a.output ?? 0))
    }
  } else {
    for (const a of relevantActuals) {
      const cur = hourOut.get(a.hour) ?? 0
      if ((a.output ?? 0) > cur) hourOut.set(a.hour, a.output ?? 0)
    }
  }
  const hourEntries  = Array.from(hourOut.entries()).sort((a, b) => a[0] - b[0])
  const hourlyOutputs = hourEntries.map(([, v]) => v)

  // MP per jam:
  // - activeSection set: MP section itu per jam (tidak dijumlah lintas section)
  // - tidak: total MP semua section per jam (line yang menjalankan semua section sekaligus)
  const hourMP = new Map<number, number>()
  for (const a of relevantActuals) {
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

  // LLER produktivitas gabungan: (actualPPH × actualMP) / (theoPPH × theoMP) × 100
  // Pakai avgPPH (rata-rata output/jam) sebagai actualPPH supaya stabil terhadap fluktuasi 1 jam.
  const ller = (avgPPH > 0 && avgMPActual > 0 && theoPPH > 0 && theoMPTotal > 0)
    ? Math.round((avgPPH * avgMPActual) / (theoPPH * theoMPTotal) * 100) : 0

  const gap    = lastHourOutput - dispTPH
  const totDT  = relevantActuals.reduce((s: number, a: any) => s + (a.downtime ?? 0), 0)
  const totDef = relevantActuals.reduce((s: number, a: any) => s + (a.defect ?? 0), 0)

  // Per-section actuals — selalu hitung semua untuk informasi tambahan;
  // view yang memutuskan mana yang ditampilkan.
  const sectionActuals: Record<string, { avgMP: number; avgOut: number; lastOut: number; ller: number; mpGap: number }> = {}
  for (const ys of yamSummaries) {
    const sa = actuals.filter((a: any) => a.section?.name === ys.name)
    if (sa.length === 0) continue
    const avgMP   = sa.reduce((s: number, a: any) => s + (a.mpActual ?? 0), 0) / sa.length
    const avgOut  = sa.reduce((s: number, a: any) => s + (a.output ?? 0), 0) / sa.length
    const lastOut = sa.sort((a: any, b: any) => b.hour - a.hour)[0]?.output ?? 0
    // LLER per section pakai formula produktivitas yang sama
    const secTheoPPH = ys.taktTime > 0 ? 3600 / ys.taktTime : 0
    const secLler = (avgOut > 0 && avgMP > 0 && secTheoPPH > 0 && ys.theorMP > 0)
      ? Math.round((avgOut * avgMP) / (secTheoPPH * ys.theorMP) * 100) : 0
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

  if (m.gap < -15) return `${p}: 📉 Aktual ${m.lastHourOutput} vs target ${m.dispTPH} (gap ${m.gap}). CT ${m.actCT}s vs takt ${m.taktStd}s.`
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
  const { t, locale }             = useI18n()

  // ── AI Insight state ──────────────────────────────────────
  type AIInsight = {
    status: 'ok' | 'warning' | 'critical'
    generatedAt: string
    locale: string
    building: string
    linesAnalyzed: number
    fromCache?: boolean
    issues: Array<{ line: string; severity: 'high' | 'medium'; title: string; detail: string }>
    patterns: Array<{ icon: string; title: string; detail: string }>
    mpAnalysis: { summary: string; items: Array<{ line: string; status: 'good' | 'over' | 'under'; detail: string }> }
    recommendations: Array<{ priority: 'high' | 'medium' | 'low'; text: string }>
  }
  const [aiData, setAiData]     = useState<AIInsight | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError]   = useState<string | null>(null)

  // Fetch AI insight ketika mode AI aktif, atau locale/building berubah
  const fetchAI = async (force = false) => {
    setAiLoading(true)
    setAiError(null)
    try {
      const url = `/api/tv-insights?building=${building}&locale=${locale}${force ? '&refresh=true' : ''}`
      const res = await fetch(url)
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      setAiData(data)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Gagal mengambil insight AI')
    } finally {
      setAiLoading(false)
    }
  }

  // Auto-fetch ketika mode = ai, atau locale berubah saat di mode ai
  useEffect(() => {
    if (mode === 'ai') fetchAI(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, locale, building])

  const lineMetrics = lines.map(l => ({ line: l, m: calcLine(l, sections, building) }))
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

  // Auto-rotate mode every 20s (45s untuk AI mode karena butuh waktu baca)
  useEffect(() => {
    if (!autoRotate) return
    let id: ReturnType<typeof setTimeout>
    const tick = () => {
      setMode(m => {
        const next: ViewMode = m === 'floor' ? 'manager' : m === 'manager' ? 'ie' : m === 'ie' ? 'ai' : 'floor'
        try { sessionStorage.setItem('tv-mode', next) } catch {}
        // AI mode dapat waktu lebih lama (45s vs 20s)
        const nextDelay = next === 'ai' ? 45000 : 20000
        id = setTimeout(tick, nextDelay)
        return next
      })
    }
    id = setTimeout(tick, 20000)
    return () => clearTimeout(id)
  }, [autoRotate])

  // Restore mode from sessionStorage on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('tv-mode') as ViewMode | null
      if (saved && ['floor', 'manager', 'ie', 'ai'].includes(saved)) setMode(saved)
    } catch {}
  }, [])

  // Page refresh every 60s to get fresh data
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
          {(['floor', 'manager', 'ie', 'ai'] as ViewMode[]).map(vm => {
            const labels: Record<ViewMode, string> = { floor: 'Floor', manager: 'Manager', ie: 'IE', ai: 'AI' }
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
                  display: 'flex', alignItems: 'center', gap: '4px',
                }}>
                {vm === 'ai' && <img src="/claude-logo.svg" alt="AI" width="16" height="16" style={{ display: 'block' }} />}
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
        {lineMetrics.map(({ line, m }, cardIdx) => {
          const sc       = statusColors(m.ller, m.hasData)
          const hasAlert = m.alerts && m.alerts.length > 0
          const mpGapLine = m.avgMPActual - m.theoMPTotal
          const la       = LINE_ACCENTS[cardIdx % LINE_ACCENTS.length]
          return (
            <div key={line.id} style={{
              background: C.card,
              border: `2px solid ${hasAlert ? C.red : la.accentBd}`,
              borderRadius: '13px', padding: '0',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}>
              {/* Colored top accent bar */}
              <div style={{ height: '4px', background: hasAlert ? C.red : la.accent }} />

              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                {/* Line header + status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '10px',
                    background: la.accentBg, border: `2px solid ${la.accentBd}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '22px', fontWeight: 800, color: la.accent,
                    fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                  }}>{line.lineNo}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '10px', color: la.accent, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Line {line.lineNo}</div>
                    {m.model ? (
                      <>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: C.white, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.model}</div>
                        <div style={{ fontSize: '10px', color: C.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.article}</div>
                      </>
                    ) : <div style={{ fontSize: '12px', color: C.gray }}>Belum ada model</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: sc.text, lineHeight: 1 }}>
                      {m.hasData ? `${m.ller}%` : '—'}
                    </div>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      {hasAlert && (
                        <div style={{
                          background: C.red, borderRadius: '4px',
                          padding: '2px 6px', fontSize: '8px', fontWeight: 700, color: '#fff',
                          whiteSpace: 'nowrap',
                        }}>⚠ ALERT</div>
                      )}
                      <div style={{
                        background: sc.bg, border: `1px solid ${sc.border}`,
                        borderRadius: '4px', padding: '2px 8px',
                        fontSize: '9px', fontWeight: 700, color: sc.text,
                      }}>{t(sc.label)}</div>
                    </div>
                  </div>
                </div>

                {/* Standard vs Aktual comparison table */}
                <div style={{
                  background: 'rgba(0,0,0,0.25)', borderRadius: '10px',
                  overflow: 'hidden', border: `1px solid ${la.stripe}`,
                }}>
                  {/* Table header */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
                    background: la.stripe,
                  }}>
                    <div style={{ padding: '5px 8px', fontSize: '9px', fontWeight: 700, color: C.gray, textAlign: 'center' }}></div>
                    <div style={{ padding: '5px 8px', fontSize: '9px', fontWeight: 700, color: C.teal, textAlign: 'center', letterSpacing: '0.5px' }}>STANDARD</div>
                    <div style={{ padding: '5px 8px', fontSize: '9px', fontWeight: 700, color: C.blue, textAlign: 'center', letterSpacing: '0.5px' }}>AKTUAL</div>
                    <div style={{ padding: '5px 8px', fontSize: '9px', fontWeight: 700, color: C.gray, textAlign: 'center', letterSpacing: '0.5px' }}>GAP</div>
                  </div>

                  {/* PPH/MP row — Produktivitas per orang per jam */}
                  {(() => {
                    const stdPPHperMP = m.theoMPTotal > 0 ? m.theoPPH / m.theoMPTotal : 0
                    const actPPHperMP = m.avgMPActual > 0 && m.lastHourOutput > 0
                      ? m.lastHourOutput / m.avgMPActual : 0
                    const ppMpGap = actPPHperMP - stdPPHperMP
                    const ppMpGapColor = ppMpGap >= -0.3 ? C.green : ppMpGap >= -0.8 ? C.amber : C.red
                    return (
                      <div style={{
                        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr',
                        borderTop: `1px solid rgba(255,255,255,0.06)`, alignItems: 'center',
                      }}>
                        <div style={{ padding: '6px 8px' }}>
                          <div style={{ fontSize: '10px', color: C.dim, fontWeight: 600 }}>PPH/MP</div>
                          <div style={{ fontSize: '8px', color: C.gray }}>prs/jam/orang</div>
                        </div>
                        <div style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <div style={{ fontSize: '20px', fontWeight: 800, color: C.teal, lineHeight: 1 }}>
                            {stdPPHperMP > 0 ? stdPPHperMP.toFixed(1) : '—'}
                          </div>
                          <div style={{ fontSize: '8px', color: C.gray, marginTop: '2px' }}>
                            {m.theoPPH > 0 ? `(${m.theoPPH} prs/jam)` : ''}
                          </div>
                        </div>
                        <div style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <div style={{ fontSize: '20px', fontWeight: 800, color: m.hasData ? C.white : C.gray, lineHeight: 1 }}>
                            {m.hasData && actPPHperMP > 0 ? actPPHperMP.toFixed(1) : '—'}
                          </div>
                          <div style={{ fontSize: '8px', color: C.gray, marginTop: '2px' }}>
                            {m.hasData ? `(${m.lastHourOutput} prs · jam ${m.lastHour})` : ''}
                          </div>
                        </div>
                        <div style={{ padding: '6px 8px', textAlign: 'center' }}>
                          {m.hasData && actPPHperMP > 0 ? (
                            <span style={{ fontSize: '15px', fontWeight: 700, color: ppMpGapColor }}>
                              {ppMpGap >= 0 ? '+' : ''}{ppMpGap.toFixed(1)}
                            </span>
                          ) : <span style={{ color: C.gray }}>—</span>}
                        </div>
                      </div>
                    )
                  })()}

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
                          color: m.taktStd > 0 && m.actCT <= m.taktStd ? C.green : C.red,
                        }}>{m.actCT}s</span>
                      ) : <span style={{ color: C.gray }}>—</span>}
                    </div>
                    <div style={{ padding: '6px 8px', textAlign: 'center' }}>
                      {m.hasData && m.actCT > 0 && m.taktStd > 0 ? (
                        <span style={{
                          fontSize: '13px', fontWeight: 600,
                          color: m.actCT <= m.taktStd ? C.green : C.red,
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
                        {m.theoMPTotal > 0 ? parseFloat(m.theoMPTotal.toFixed(1)) : '—'}
                      </span>
                      {m.stdMPTotal > 0 && m.stdMPTotal !== m.theoMPTotal && (
                        <span style={{ fontSize: '9px', color: C.gray, marginLeft: '3px' }}>std {parseFloat(m.stdMPTotal.toFixed(1))}</span>
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

                {/* Section breakdown — kalau activeSection set, hanya tampil section itu */}
                {m.yamSummaries.length > 0 && m.hasData && (() => {
                  const sectionsToShow = m.activeSection
                    ? m.yamSummaries.filter(y => y.name === m.activeSection)
                    : m.yamSummaries
                  return (
                  <div style={{
                    background: la.stripe, borderRadius: '8px',
                    padding: '6px 8px', border: `1px solid ${la.accentBd}`,
                  }}>
                    <div style={{ fontSize: '9px', color: la.accent, fontWeight: 700, marginBottom: '4px', letterSpacing: '0.5px' }}>
                      {m.activeSection
                        ? `SECTION AKTIF: ${m.activeSection} — THEO MP / ACT MP / LLER`
                        : 'SECTION — THEO MP / ACT MP / LLER'}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {sectionsToShow.map(ys => {
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
                            <span style={{ color: C.white, fontWeight: 600, fontSize: '9px' }}>{ys.name}</span>
                            <span style={{ color: C.teal, fontWeight: 700 }}>{parseFloat(ys.theorMP.toFixed(1))}</span>
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
                  )
                })()}

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
                          background: m.targetPct >= 100 ? C.green : la.accent, borderRadius: '3px',
                        }} />
                      </div>
                    </div>
                  )}
                  {m.hasData && (m.totDT > 0 || m.totDef > 0) && (
                    <div style={{ display: 'flex', gap: '6px' }}>
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
                    <Sparkline data={m.hourlyOutputs} color={la.accent} height={20} />
                  </div>
                )}
              </div>
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
                        <div style={{ fontSize: '18px', fontWeight: 700, color: sc.text }}>{m.lastHourOutput}/{m.dispTPH}</div>
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
                      {hasAlert ? '⚠ ALERT' : t(sc.label)}
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
            { label: 'PPH/MP',  align: 'center', color: C.teal },
            { label: 'MP',      align: 'center', color: C.blue },
            { label: 'CT',      align: 'center', color: C.blue },
            { label: 'PPH/MP',  align: 'center', color: C.blue },
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
                    {m.stdMPTotal > 0 ? <div style={{ fontSize: '17px', fontWeight: 700, color: C.teal }}>{parseFloat(m.stdMPTotal.toFixed(1))}</div> : <span style={{ color: C.gray }}>—</span>}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    {m.theoMPTotal > 0 ? <div style={{ fontSize: '17px', fontWeight: 700, color: C.teal }}>{parseFloat(m.theoMPTotal.toFixed(1))}</div> : <span style={{ color: C.gray }}>—</span>}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    {m.theoPPH > 0 && m.theoMPTotal > 0 ? (
                      <>
                        <div style={{ fontSize: '17px', fontWeight: 700, color: C.teal }}>
                          {(m.theoPPH / m.theoMPTotal).toFixed(1)}
                        </div>
                        <div style={{ fontSize: '9px', color: C.gray }}>{m.theoPPH} prs/jam</div>
                      </>
                    ) : <span style={{ color: C.gray }}>—</span>}
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
                        color: m.taktStd > 0 && m.actCT <= m.taktStd ? C.green : C.red,
                      }}>{m.actCT}<span style={{ fontSize: '10px', color: C.dim }}>s</span></div>
                    ) : <span style={{ color: C.gray }}>—</span>}
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    {m.hasData && m.avgMPActual > 0 && m.lastHourOutput > 0 ? (
                      <>
                        <div style={{ fontSize: '17px', fontWeight: 700, color: sc.text }}>
                          {(m.lastHourOutput / m.avgMPActual).toFixed(1)}
                        </div>
                        <div style={{ fontSize: '9px', color: C.gray }}>
                          {m.lastHourOutput} prs · <span style={{ color: gapColor(m.gap), fontWeight: 600 }}>{m.gap >= 0 ? '+' : ''}{m.gap}</span>
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
                    }}>{t(sc.label)}</div>
                  </div>
                </div>

                {/* Section chips with LLER per section — kalau activeSection set, hanya tampil section itu */}
                {m.yamSummaries.length > 0 && (() => {
                  const sectionsToShow = m.activeSection
                    ? m.yamSummaries.filter(y => y.name === m.activeSection)
                    : m.yamSummaries
                  return (
                  <div style={{
                    padding: '0 12px 8px',
                    display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center',
                  }}>
                    {m.activeSection && (
                      <span style={{
                        fontSize: '9px', color: C.teal, fontWeight: 700,
                        letterSpacing: '0.5px', marginRight: '4px',
                      }}>SECTION AKTIF:</span>
                    )}
                    {sectionsToShow.map(ys => {
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
                                ({act.mpGap > 0 ? '+' : ''}{parseFloat(act.mpGap.toFixed(1))})
                              </span>
                            )}
                          </span>
                          <span>Theo <b style={{ color: C.amber }}>{parseFloat(ys.theorMP.toFixed(1))}</b></span>
                          {act && (
                            <span>LLER <b style={{ color: secSc.text }}>{act.ller}%</b></span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════
  // MODE: AI — Strukturisasi analisis AI dalam 4 kartu
  // ════════════════════════════════════════════════════════════
  const AIView = () => {
    // Status banner color
    const statusConfig = {
      ok:       { color: C.green, bg: C.greenBg, bd: C.greenBd, label: t('tv.stHealthy'),  icon: '✓' },
      warning:  { color: C.amber, bg: C.amberBg, bd: C.amberBd, label: t('tv.stWarning'),  icon: '⚠' },
      critical: { color: C.red,   bg: C.redBg,   bd: C.redBd,   label: t('tv.stCritical2'), icon: '⛔' },
    }
    const sc = aiData ? statusConfig[aiData.status] : statusConfig.ok

    // Loading state
    if (aiLoading && !aiData) {
      return (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '14px',
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px',
        }}>
          <div style={{
            width: '52px', height: '52px',
            border: `4px solid ${C.border}`, borderTopColor: C.teal,
            borderRadius: '50%', animation: 'spin 1s linear infinite',
          }} />
          <div style={{ fontSize: '14px', color: C.dim }}><img src="/claude-logo.svg" alt="AI" width="16" height="16" /> AI sedang menganalisis data line...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )
    }

    // Error state
    if (aiError) {
      return (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '12px',
          background: C.surface, border: `1px solid ${C.redBd}`, borderRadius: '10px',
          padding: '20px',
        }}>
          <div style={{ fontSize: '40px' }}>⚠</div>
          <div style={{ fontSize: '14px', color: C.red, fontWeight: 600 }}>AI Insight tidak tersedia</div>
          <div style={{ fontSize: '11px', color: C.dim, textAlign: 'center', maxWidth: '400px' }}>{aiError}</div>
          <button onClick={() => fetchAI(true)} style={{
            background: C.teal, color: '#fff', border: 'none',
            padding: '8px 18px', borderRadius: '6px',
            fontSize: '12px', fontWeight: 600, cursor: 'pointer',
          }}>🔄 Coba Lagi</button>
        </div>
      )
    }

    // Empty/no data state
    if (!aiData || aiData.linesAnalyzed === 0) {
      return (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '12px',
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: '10px',
        }}>
          <div style={{ fontSize: '40px' }}>⏳</div>
          <div style={{ fontSize: '15px', color: C.white, fontWeight: 600 }}>
            {aiData?.patterns[0]?.title ?? 'Belum ada data input hari ini'}
          </div>
          <div style={{ fontSize: '12px', color: C.dim }}>
            {aiData?.patterns[0]?.detail ?? 'Menunggu input dari Team Leader untuk analisis AI'}
          </div>
        </div>
      )
    }

    // Format generated time
    const genTime = new Date(aiData.generatedAt).toLocaleTimeString('id-ID', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
    })

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden' }}>

        {/* ── Status Banner + Controls ── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: sc.bg, border: `1px solid ${sc.bd}`, borderRadius: '10px',
          padding: '10px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ fontSize: '24px' }}>{sc.icon}</div>
            <div>
              <div style={{ fontSize: '11px', color: C.dim, textTransform: 'uppercase', letterSpacing: '1px' }}>
                Status Gedung {building}
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: sc.color, lineHeight: 1.1 }}>
                {sc.label}
              </div>
            </div>
            <div style={{ width: '1px', background: C.border, height: '36px', margin: '0 6px' }} />
            <div>
              <div style={{ fontSize: '11px', color: C.dim }}>Lines dianalisis</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: C.white }}>{aiData.linesAnalyzed}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '10px', color: C.gray }}>
                {aiData.fromCache ? '📦 Cache' : '🆕 Fresh'}
              </div>
              <div style={{ fontSize: '11px', color: C.dim }}>{genTime} WIB</div>
            </div>
            <button onClick={() => fetchAI(true)}
              disabled={aiLoading}
              style={{
                background: aiLoading ? C.border : C.teal, color: '#fff',
                border: 'none', padding: '6px 12px', borderRadius: '6px',
                fontSize: '11px', fontWeight: 600,
                cursor: aiLoading ? 'wait' : 'pointer',
              }}>
              {aiLoading ? '⏳' : '🔄'} Regenerate
            </button>
          </div>
        </div>

        {/* ── 4 KARTU AI ── */}
        <div style={{
          flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr',
          gap: '8px', overflow: 'hidden',
        }}>

          {/* Kartu 1: Masalah Kritis (atau Sehat) */}
          <div style={{
            background: aiData.issues.length === 0 ? C.greenBg : C.redBg,
            border: `1px solid ${aiData.issues.length === 0 ? C.greenBd : C.redBd}`,
            borderRadius: '10px', padding: '12px',
            display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>{aiData.issues.length === 0 ? '🟢' : '🔴'}</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: C.white }}>
                {aiData.issues.length === 0 ? 'Semua Line Sehat' : `Masalah Kritis (${aiData.issues.length})`}
              </span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {aiData.issues.length === 0 ? (
                <div style={{ fontSize: '12px', color: C.dim, padding: '6px 0' }}>
                  Tidak ditemukan masalah signifikan pada line yang aktif saat ini.
                </div>
              ) : aiData.issues.map((issue, i) => (
                <div key={i} style={{
                  background: 'rgba(0,0,0,0.25)', borderRadius: '6px', padding: '6px 9px',
                  borderLeft: `3px solid ${issue.severity === 'high' ? C.red : C.amber}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '6px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: C.white }}>
                      {issue.line} · {issue.title}
                    </span>
                    <span style={{ fontSize: '9px', color: issue.severity === 'high' ? C.red : C.amber, fontWeight: 700, flexShrink: 0 }}>
                      {issue.severity === 'high' ? 'HIGH' : 'MED'}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: C.dim, marginTop: '2px', lineHeight: 1.4 }}>
                    {issue.detail}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Kartu 2: Pattern & Tren */}
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: '10px', padding: '12px',
            display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>📈</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: C.white }}>Pattern & Tren</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {aiData.patterns.length === 0 ? (
                <div style={{ fontSize: '12px', color: C.dim }}>Belum ada pattern signifikan terdeteksi.</div>
              ) : aiData.patterns.map((p, i) => (
                <div key={i} style={{
                  background: 'rgba(255,255,255,0.04)', borderRadius: '6px', padding: '6px 9px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '14px' }}>{p.icon}</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: C.white }}>{p.title}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: C.dim, marginTop: '2px', lineHeight: 1.4 }}>
                    {p.detail}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Kartu 3: MP Analysis */}
          <div style={{
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: '10px', padding: '12px',
            display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>👥</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: C.white }}>Analisis MP</span>
            </div>
            <div style={{ fontSize: '11px', color: C.dim, lineHeight: 1.4, padding: '4px 0' }}>
              {aiData.mpAnalysis.summary}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {aiData.mpAnalysis.items.map((item, i) => {
                const sColor = item.status === 'good' ? C.green
                  : item.status === 'over' ? C.amber : C.red
                const sLabel = item.status === 'good' ? '✓' : item.status === 'over' ? '↑' : '↓'
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'flex-start', gap: '6px',
                    background: 'rgba(255,255,255,0.04)', borderRadius: '5px', padding: '4px 8px',
                  }}>
                    <span style={{
                      flexShrink: 0, width: '20px', textAlign: 'center',
                      fontSize: '13px', fontWeight: 700, color: sColor,
                    }}>{sLabel}</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: C.white, minWidth: '28px' }}>{item.line}</span>
                    <span style={{ fontSize: '11px', color: C.dim, flex: 1, lineHeight: 1.4 }}>{item.detail}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Kartu 4: Rekomendasi */}
          <div style={{
            background: `linear-gradient(135deg, ${C.tealBg}, ${C.card})`,
            border: `1px solid ${C.tealBd}`,
            borderRadius: '10px', padding: '12px',
            display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>💡</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: C.white }}>Rekomendasi Tindakan</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {aiData.recommendations.length === 0 ? (
                <div style={{ fontSize: '12px', color: C.dim }}>Tidak ada rekomendasi spesifik — pertahankan kinerja saat ini.</div>
              ) : aiData.recommendations.map((rec, i) => {
                const pColor = rec.priority === 'high' ? C.red
                  : rec.priority === 'medium' ? C.amber : C.teal
                return (
                  <div key={i} style={{
                    background: 'rgba(0,0,0,0.2)', borderRadius: '6px',
                    padding: '6px 9px',
                    borderLeft: `3px solid ${pColor}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '2px' }}>
                      <span style={{
                        fontSize: '9px', fontWeight: 700, color: pColor,
                        textTransform: 'uppercase', letterSpacing: '0.5px',
                      }}>
                        {rec.priority === 'high' ? '⚡ TINGGI' : rec.priority === 'medium' ? '◆ SEDANG' : '○ RENDAH'}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: C.white, lineHeight: 1.4 }}>{rec.text}</div>
                  </div>
                )
              })}
            </div>
          </div>
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
      {mode === 'ai' && <AIView />}
      {Insight}
      {Footer}
    </div>
  )
}