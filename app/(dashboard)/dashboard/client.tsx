'use client'
import { useState, useEffect } from 'react'
import { useI18n } from '@/lib/i18n'
import Link from 'next/link'

// ── Types ────────────────────────────────────────────────────
interface LineActual {
  hour: number; output: number; mpActual: number
  downtime: number; dtReason: string | null; defect: number
  sectionName: string; taktTime: number
}
interface LineAlert { type: string; message: string }
interface LineModel { name: string; article: string; lineType: string; imageUrl: string | null }
interface DashLine {
  id: string; building: string; lineNo: number
  model: LineModel | null; actuals: LineActual[]
  alerts: LineAlert[]; dailyTarget: number | null
  sectionTheoMP: Record<string, number>  // theorMP per section dari IE standard
}
interface Props {
  lines: DashLine[]
  totalModels: number
  userName: string
  userRole: string
  userBuilding: string | null
  buildings: Record<string, number>
}

// ── Helpers ──────────────────────────────────────────────────
/**
 * LLER (Line Level Efficiency Rate)
 * Formula IE: LLER = Theoretical MP / Actual MP × 100%
 *
 * theorMP : dari IE standard (total GWT semua ops / Takt Time)
 * actual MP : rata-rata MP hadir per section per hari
 *
 * LLER ~96% = labor digunakan 96% efisien
 * LLER >100% = understaffed (butuh lebih banyak orang dari teori)
 * LLER <85%  = ada idle capacity, terlalu banyak orang
 */
function calcLineLler(line: DashLine): number {
  if (line.actuals.length === 0) return 0
  const secMap = new Map<string, { mpSum: number; hours: number }>()
  for (const a of line.actuals) {
    const prev = secMap.get(a.sectionName) ?? { mpSum: 0, hours: 0 }
    secMap.set(a.sectionName, { mpSum: prev.mpSum + a.mpActual, hours: prev.hours + 1 })
  }
  let totalTheo = 0, totalActualMP = 0
  for (const [secName, data] of secMap.entries()) {
    const theo = line.sectionTheoMP[secName]
    if (theo && theo > 0 && data.hours > 0) {
      totalTheo += theo
      totalActualMP += data.mpSum / data.hours
    }
  }
  return totalActualMP > 0 ? Math.round((totalTheo / totalActualMP) * 100) : 0
}

function llerColor(v: number): string {
  if (v >= 90) return '#1D9E75'
  if (v >= 75) return '#EF9F27'
  if (v > 0) return '#EF4444'
  return '#D1D5DB'
}

function llerBg(v: number): string {
  if (v >= 90) return '#F0FDF9'
  if (v >= 75) return '#FFFBEB'
  if (v > 0) return '#FEF2F2'
  return '#F9FAFB'
}

/** Hitung LLER per section: theorMP / avg actual MP */
function calcSectionLlers(line: DashLine): { name: string; ller: number; theorMP: number; avgMP: number; output: number }[] {
  if (line.actuals.length === 0) return []
  const secMap = new Map<string, { mpSum: number; outSum: number; hours: number }>()
  for (const a of line.actuals) {
    const prev = secMap.get(a.sectionName) ?? { mpSum: 0, outSum: 0, hours: 0 }
    secMap.set(a.sectionName, { mpSum: prev.mpSum + a.mpActual, outSum: prev.outSum + a.output, hours: prev.hours + 1 })
  }
  return Array.from(secMap.entries())
    .map(([name, s]) => {
      const theo = line.sectionTheoMP[name] ?? 0
      const avgMP = s.hours > 0 ? parseFloat((s.mpSum / s.hours).toFixed(1)) : 0
      const ller = avgMP > 0 && theo > 0 ? Math.round((theo / avgMP) * 100) : 0
      return { name, ller, theorMP: theo, avgMP, output: s.outSum }
    })
    .filter(s => s.theorMP > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
}

// ── AI Factory Digest (rule-based, smart) ────────────────────
function generateDigest(lines: DashLine[], buildings: Record<string, number>): string[] {
  const insights: string[] = []

  // 1. Building ranking
  const bldgStats = Object.keys(buildings).map(b => {
    const bLines = lines.filter(l => l.building === b)
    const withData = bLines.filter(l => l.actuals.length > 0)
    const avgLler = withData.length > 0
      ? Math.round(withData.reduce((s, l) => s + calcLineLler(l), 0) / withData.length) : 0
    const totalOut = bLines.reduce((s, l) => l.actuals.reduce((ss, a) => ss + a.output, 0) + s, 0)
    const totalDT = bLines.reduce((s, l) => l.actuals.reduce((ss, a) => ss + a.downtime, 0) + s, 0)
    const alertCount = bLines.reduce((s, l) => s + l.alerts.length, 0)
    const noData = bLines.length - withData.length
    return { building: b, avgLler, totalOut, totalDT, alertCount, withData: withData.length, noData, total: bLines.length }
  }).filter(b => b.total > 0)

  // Worst building
  const worst = bldgStats.filter(b => b.withData > 0).sort((a, b) => a.avgLler - b.avgLler)[0]
  const best = bldgStats.filter(b => b.withData > 0).sort((a, b) => b.avgLler - a.avgLler)[0]

  if (best && best.avgLler >= 90) {
    insights.push(`✅ Gedung ${best.building} performa terbaik hari ini — LLER ${best.avgLler}% (${best.withData} line aktif). Pertahankan!`)
  }
  if (worst && worst.avgLler < 75 && worst.withData > 0) {
    insights.push(`🔴 Gedung ${worst.building} butuh perhatian — LLER hanya ${worst.avgLler}%. Cek line dengan output rendah.`)
  }

  // 2. Lines with alerts
  const alertLines = lines.filter(l => l.alerts.length > 0)
  if (alertLines.length > 0) {
    const topAlert = alertLines[0]
    insights.push(`⚠ ${alertLines.length} line punya alert aktif. ${topAlert.alerts[0]?.message ?? ''} (Gdg ${topAlert.building} L${topAlert.lineNo})`)
  }

  // 3. Target tracking
  const withTarget = lines.filter(l => l.dailyTarget)
  if (withTarget.length > 0) {
    const totalTarget = withTarget.reduce((s, l) => s + (l.dailyTarget ?? 0), 0)
    const totalActual = withTarget.reduce((s, l) => s + l.actuals.reduce((ss, a) => ss + a.output, 0), 0)
    const pct = Math.round((totalActual / totalTarget) * 100)
    if (pct >= 100) {
      insights.push(`🎯 Target harian tercapai! Output ${totalActual.toLocaleString()} dari target ${totalTarget.toLocaleString()} pairs (${pct}%).`)
    } else if (pct < 50) {
      insights.push(`🎯 Progress target baru ${pct}% (${totalActual.toLocaleString()} / ${totalTarget.toLocaleString()}). Perlu akselerasi output.`)
    }
  }

  // 4. High downtime lines
  const highDT = lines
    .map(l => ({ ...l, totalDT: l.actuals.reduce((s, a) => s + a.downtime, 0) }))
    .filter(l => l.totalDT > 30)
    .sort((a, b) => b.totalDT - a.totalDT)
  if (highDT.length > 0) {
    const top = highDT[0]
    const reason = top.actuals.find(a => a.dtReason)?.dtReason ?? ''
    insights.push(`⏱ Gdg ${top.building} L${top.lineNo}: downtime ${top.totalDT} mnt${reason ? ` (${reason})` : ''}. Identifikasi root cause.`)
  }

  // 5. Lines with no data
  const noDataBuildings = bldgStats.filter(b => b.noData > 0)
  if (noDataBuildings.length > 0) {
    const totalNoData = noDataBuildings.reduce((s, b) => s + b.noData, 0)
    insights.push(`📋 ${totalNoData} line belum ada data hari ini. Pastikan Team Leader sudah input.`)
  }

  // 6. Trend detection per line
  for (const l of lines) {
    if (l.actuals.length < 3) continue
    const sorted = [...l.actuals].sort((a, b) => a.hour - b.hour)
    const last3 = sorted.slice(-3)
    const trend = last3[2].output - last3[0].output
    if (trend < -20) {
      insights.push(`📉 Gdg ${l.building} L${l.lineNo}: output turun ${Math.abs(trend)} pairs dalam 3 jam terakhir. Investigasi segera.`)
      break // only report 1 declining line
    }
  }

  // 7. Defect rate
  const totalOut = lines.reduce((s, l) => s + l.actuals.reduce((ss, a) => ss + a.output, 0), 0)
  const totalDef = lines.reduce((s, l) => s + l.actuals.reduce((ss, a) => ss + a.defect, 0), 0)
  if (totalOut > 0 && totalDef > 0) {
    const dr = ((totalDef / totalOut) * 100).toFixed(1)
    if (parseFloat(dr) > 2) {
      insights.push(`🔍 Defect rate ${dr}% (${totalDef} pairs). Lakukan quality check di line dengan defect tertinggi.`)
    }
  }

  // 8. Section imbalance — section LLER gap dalam 1 line
  for (const l of lines) {
    if (l.actuals.length < 2) continue
    const secMap = new Map<string, { out: number; tgt: number }>()
    for (const a of l.actuals) {
      const tph = a.taktTime > 0 ? Math.floor(3600 / a.taktTime) : 0
      if (tph === 0) continue
      const prev = secMap.get(a.sectionName) ?? { out: 0, tgt: 0 }
      secMap.set(a.sectionName, { out: prev.out + a.output, tgt: prev.tgt + tph })
    }
    const secLlers = Array.from(secMap.entries())
      .filter(([, s]) => s.tgt > 0)
      .map(([name, s]) => ({ name, ller: Math.round((s.out / s.tgt) * 100) }))

    if (secLlers.length >= 2) {
      const sorted = secLlers.sort((a, b) => a.ller - b.ller)
      const worst = sorted[0]
      const best = sorted[sorted.length - 1]
      const gap = best.ller - worst.ller
      if (gap >= 20) {
        insights.push(
          `⚖️ Gdg ${l.building} L${l.lineNo}: gap antar section ${gap}%. ` +
          `${best.name} ${best.ller}% vs ${worst.name} ${worst.ller}%. ` +
          `Fokus perbaikan di ${worst.name}.`
        )
        break // only report 1 imbalanced line
      }
    }
  }

  if (insights.length === 0) {
    insights.push('ℹ️ Belum cukup data untuk generate insight. Menunggu input dari Team Leader.')
  }

  return insights.slice(0, 6) // max 6 insights
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
export default function DashboardClient({ lines, totalModels, userName, userRole, userBuilding, buildings }: Props) {
  const { t } = useI18n()

  // ── Compute metrics ──
  const withData = lines.filter(l => l.actuals.length > 0)
  const totalOutput = lines.reduce((s, l) => l.actuals.reduce((ss, a) => ss + a.output, 0) + s, 0)
  const totalDT = lines.reduce((s, l) => l.actuals.reduce((ss, a) => ss + a.downtime, 0) + s, 0)
  const totalDefect = lines.reduce((s, l) => l.actuals.reduce((ss, a) => ss + a.defect, 0) + s, 0)
  const activeAlerts = lines.reduce((s, l) => s + l.alerts.length, 0)
  const avgLler = withData.length > 0
    ? Math.round(withData.reduce((s, l) => s + calcLineLler(l), 0) / withData.length) : 0

  const totalDailyTarget = lines.reduce((s, l) => s + (l.dailyTarget ?? 0), 0)
  const targetPct = totalDailyTarget > 0 ? Math.round((totalOutput / totalDailyTarget) * 100) : 0

  // ── AI Digest ──
  const digest = generateDigest(lines, buildings)

  // ── Building stats (for ranking) ──
  const bldgStats = Object.keys(buildings)
    .filter(b => !userBuilding || userBuilding === b)
    .map(b => {
      const bLines = lines.filter(l => l.building === b)
      const bWithData = bLines.filter(l => l.actuals.length > 0)
      const bAvgLler = bWithData.length > 0
        ? Math.round(bWithData.reduce((s, l) => s + calcLineLler(l), 0) / bWithData.length) : 0
      const bOutput = bLines.reduce((s, l) => l.actuals.reduce((ss, a) => ss + a.output, 0) + s, 0)
      const bAlerts = bLines.reduce((s, l) => s + l.alerts.length, 0)
      return { building: b, avgLler: bAvgLler, output: bOutput, alerts: bAlerts, active: bWithData.length, total: bLines.length }
    })
    .sort((a, b) => b.avgLler - a.avgLler)

  const [dateStr, setDateStr] = useState('')
  useEffect(() => {
    setDateStr(new Date().toLocaleDateString('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta',
    }))
  }, [])

  return (
    <div>
      {/* ── Header ── */}
      <div className="mb-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Factory Overview</h1>
            <p className="text-sm text-gray-500 mt-1">{dateStr}</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">{userName}</div>
            <div className="text-xs text-gray-400">{userRole.replace('_', ' ')}{userBuilding ? ` · Gdg ${userBuilding}` : ''}</div>
          </div>
        </div>
      </div>

      {/* ── KPI Summary ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {[
          { label: 'Avg LLER', value: withData.length > 0 ? `${avgLler}%` : '—', color: llerColor(avgLler), bg: llerBg(avgLler) },
          { label: t('tv.totalOutput'), value: totalOutput.toLocaleString(), color: '#111827', bg: '#F9FAFB' },
          { label: t('tv.dailyTarget'), value: totalDailyTarget > 0 ? `${targetPct}%` : '—', color: targetPct >= 100 ? '#1D9E75' : '#EF9F27', bg: totalDailyTarget > 0 ? (targetPct >= 100 ? '#F0FDF9' : '#FFFBEB') : '#F9FAFB' },
          { label: t('tv.downtime'), value: `${totalDT} ${t('common.minutes')}`, color: totalDT > 60 ? '#EF4444' : '#111827', bg: totalDT > 60 ? '#FEF2F2' : '#F9FAFB' },
          { label: t('tv.alert'), value: `${activeAlerts}`, color: activeAlerts > 0 ? '#EF4444' : '#1D9E75', bg: activeAlerts > 0 ? '#FEF2F2' : '#F0FDF9' },
        ].map(k => (
          <div key={k.label} className="rounded-xl border border-gray-100 p-4" style={{ background: k.bg }}>
            <div className="text-3xl font-semibold" style={{ color: k.color }}>{k.value}</div>
            <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── Target Progress Bar ── */}
      {totalDailyTarget > 0 && (
        <div className="rounded-xl border border-gray-100 bg-white p-3 mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-gray-500">{t('tv.progressTitle')}</span>
            <span className="text-sm font-semibold" style={{ color: targetPct >= 100 ? '#1D9E75' : '#EF9F27' }}>
              {totalOutput.toLocaleString()} / {totalDailyTarget.toLocaleString()} {t('common.pairs')}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(targetPct, 100)}%`, background: targetPct >= 100 ? '#1D9E75' : '#EF9F27' }}
            />
          </div>
        </div>
      )}

      {/* ── AI Factory Digest ── */}
      <div className="rounded-xl border border-gray-100 bg-white mb-4 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold text-white" style={{ background: '#1D9E75' }}>
            <img src="/claude-logo.svg" alt="AI" style={{ width: 14, height: 14 }} /> AI
          </span>
          <span className="text-sm font-semibold text-gray-800">Factory Digest</span>
          <span className="text-xs text-gray-400 ml-auto">Auto-generated insights</span>
        </div>
        <div className="divide-y divide-gray-50">
          {digest.map((insight, i) => (
            <div key={i} className="px-4 py-3 text-sm text-gray-700 leading-relaxed">
              {insight}
            </div>
          ))}
        </div>
      </div>

      {/* ── Building Ranking ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Ranking table */}
        <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <span className="text-sm font-semibold text-gray-800">Building Ranking</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-50 text-xs text-gray-400">
                <th className="text-left px-4 py-2">#</th>
                <th className="text-left px-2 py-2">Gedung</th>
                <th className="text-right px-2 py-2">LLER</th>
                <th className="text-right px-2 py-2">Output</th>
                <th className="text-right px-4 py-2">Line aktif</th>
              </tr>
            </thead>
            <tbody>
              {bldgStats.map((b, i) => (
                <tr key={b.building} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5 text-gray-400 font-medium">{i + 1}</td>
                  <td className="px-2 py-2.5">
                    <Link href={`/tv/${b.building}`} className="font-medium text-gray-800 hover:text-teal transition-colors">
                      Gedung {b.building}
                    </Link>
                  </td>
                  <td className="px-2 py-2.5 text-right font-semibold" style={{ color: llerColor(b.avgLler) }}>
                    {b.active > 0 ? `${b.avgLler}%` : '—'}
                  </td>
                  <td className="px-2 py-2.5 text-right text-gray-600">{b.output.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right text-gray-400">{b.active}/{b.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Quick stats */}
        <div className="rounded-xl border border-gray-100 bg-white p-4">
          <div className="text-sm font-semibold text-gray-800 mb-3">Quick Stats</div>
          <div className="space-y-3">
            {[
              { label: 'Total line', value: lines.length, sub: `${withData.length} aktif hari ini` },
              { label: 'Models aktif', value: totalModels, sub: '' },
              { label: 'Total defect', value: totalDefect, sub: totalOutput > 0 ? `${((totalDefect / totalOutput) * 100).toFixed(1)}% defect rate` : '' },
              { label: 'Avg MP', value: withData.length > 0 ? Math.round(lines.reduce((s, l) => s + l.actuals.reduce((ss, a) => ss + a.mpActual, 0), 0) / Math.max(lines.reduce((s, l) => s + l.actuals.length, 0), 1)) : '—', sub: '' },
            ].map(s => (
              <div key={s.label} className="flex items-center justify-between">
                <span className="text-sm text-gray-500">{s.label}</span>
                <div className="text-right">
                  <span className="text-lg font-semibold text-gray-900">{s.value}</span>
                  {s.sub && <div className="text-xs text-gray-400">{s.sub}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Per-Building Line Cards ── */}
      <div className="space-y-4">
        {bldgStats.map(({ building }) => {
          const bLines = lines.filter(l => l.building === building)
          return (
            <div key={building} className="rounded-xl border border-gray-100 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-800">Gedung {building}</span>
                  {building === 'G' && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">Stockfit</span>}
                </div>
                <Link href={`/tv/${building}`} className="text-xs text-teal hover:underline">
                  TV Display →
                </Link>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px bg-gray-50 p-px">
                {bLines.map(line => {
                  const lineLler = calcLineLler(line)
                  const sectionLlers = calcSectionLlers(line)
                  const lineOut = line.actuals.reduce((s, a) => s + a.output, 0)
                  const hasData = line.actuals.length > 0
                  const alerts = line.alerts.length

                  return (
                    <Link key={line.id} href={`/lines/${line.building}/${line.lineNo}`}
                      className="bg-white p-3 hover:bg-gray-50 transition-colors relative block">
                      {/* Alert badge */}
                      {alerts > 0 && (
                        <span className="absolute top-2 right-2 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                          {alerts}
                        </span>
                      )}

                      {/* Line number + model */}
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: hasData ? llerColor(lineLler) : '#D1D5DB' }} />
                        <span className="text-sm font-semibold text-gray-800">L{line.lineNo}</span>
                      </div>

                      {/* Line LLER (summary) */}
                      {hasData ? (
                        <>
                          <div className="text-2xl font-bold mb-1" style={{ color: llerColor(lineLler) }}>
                            {lineLler}%
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(lineLler, 100)}%`, background: llerColor(lineLler) }} />
                          </div>

                          {/* Per-section LLER breakdown */}
                          {sectionLlers.length > 1 && (
                            <div className="space-y-1 mb-2">
                              {sectionLlers.map(sec => (
                                <div key={sec.name} className="flex items-center gap-1.5">
                                  <span className="text-xs text-gray-400 w-12 truncate" title={sec.name}>
                                    {sec.name.length > 6 ? sec.name.slice(0, 5) + '…' : sec.name}
                                  </span>
                                  <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${Math.min(sec.ller, 100)}%`, background: llerColor(sec.ller) }} />
                                  </div>
                                  <span className="text-xs font-medium w-8 text-right" style={{ color: llerColor(sec.ller) }}>
                                    {sec.ller}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="text-xs text-gray-500">{lineOut.toLocaleString()} {t('common.pairs')}</div>
                          {line.dailyTarget && (
                            <div className="text-xs text-gray-400">
                              / {line.dailyTarget.toLocaleString()} target
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-sm text-gray-300 mt-1">
                          {line.model ? line.model.name : '—'}
                        </div>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Footer ── */}
      <div className="text-center text-xs text-gray-300 mt-6 mb-4">
        {t('app.by')} <span className="font-medium text-gray-400">Third Axis Center</span>
      </div>
    </div>
  )
}
