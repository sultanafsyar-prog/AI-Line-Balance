'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { BUILDINGS } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from 'recharts'

type LineData = {
  id: string; lineNo: number; building: string
  model: { name: string; lineType: string } | null
  ller: number; lastOutput: number; tph: number
  todayOutput: number; todayDowntime: number; todayDefect: number
  hoursInput: number; alerts: any[]; status: string
}
type BuildingData = {
  building: string; lines: LineData[]
  summary: { totalLines: number; activeLines: number; totalOutput: number; avgLler: number; totalAlerts: number; criticalLines: number }
}
type DashData = {
  overall: { totalLines: number; activeLines: number; totalOutput: number; avgLler: number; totalAlerts: number; criticalLines: number }
  buildings: BuildingData[]
  userBuilding: string | null
}

type HourPoint = { hour: number; lller: number; output: number; mpAvg: number; lineCount: number }
type DayPoint  = { date: string; lller: number; output: number; mpAvg: number; activeLines: number }
type TrendData = { hourly: HourPoint[]; daily: DayPoint[] }

const STATUS_CONFIG = {
  good:     { dot: 'bg-teal',       bg: 'bg-green-50',  border: 'border-green-100',  text: 'text-green-800' },
  warning:  { dot: 'bg-yellow-400', bg: 'bg-yellow-50', border: 'border-yellow-100', text: 'text-yellow-800' },
  critical: { dot: 'bg-red-500',    bg: 'bg-red-50',    border: 'border-red-100',    text: 'text-red-800' },
  no_input: { dot: 'bg-amber-300',  bg: 'bg-amber-50',  border: 'border-amber-100',  text: 'text-amber-700' },
  no_model: { dot: 'bg-gray-300',   bg: 'bg-gray-50',   border: 'border-gray-100',   text: 'text-gray-400' },
}

interface Props { userBuilding: string | null; userName: string }

export default function ManagerClient({ userBuilding, userName }: Props) {
  const { t } = useI18n()
  const [data, setData]           = useState<DashData | null>(null)
  const [trend, setTrend]         = useState<TrendData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [selBuilding, setSelBuilding] = useState(userBuilding ?? 'ALL')
  const [lastUpdate, setLastUpdate]   = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchData = useCallback(async () => {
    const b = selBuilding !== 'ALL' ? `?building=${selBuilding}` : ''
    const [resMain, resTrend] = await Promise.all([
      fetch(`/api/manager${b}`),
      fetch(`/api/lller-trend${b}`),
    ])
    if (resMain.ok) { setData(await resMain.json()); setLastUpdate(new Date()) }
    if (resTrend.ok) { setTrend(await resTrend.json()) }
    setLoading(false)
  }, [selBuilding])

  useEffect(() => { setLoading(true); fetchData() }, [fetchData])
  useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(fetchData, 60000)
    return () => clearInterval(t)
  }, [autoRefresh, fetchData])

  const overall   = data?.overall
  const buildings = data?.buildings ?? []
  const filtered  = selBuilding === 'ALL' ? buildings : buildings.filter(b => b.building === selBuilding)

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t('managerPage.title')}</h1>
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-2">
            {lastUpdate ? `Update: ${lastUpdate.toLocaleTimeString('id-ID')}` : t('common.loading')}
            <button onClick={() => setAutoRefresh(a => !a)}
              className={`px-2 py-0.5 rounded text-xs border ${autoRefresh ? 'bg-teal-light border-teal text-teal-dark' : 'bg-gray-100 border-gray-200 text-gray-500'}`}>
              {autoRefresh ? '● Auto' : '○ Manual'}
            </button>
            <button onClick={fetchData} className="px-2 py-0.5 rounded text-xs border border-gray-200 hover:bg-gray-50">↺</button>
          </p>
        </div>
        <a href="/api/export/daily" className="btn btn-secondary text-sm">↓ {t('monitor.exportToday')}</a>
      </div>

      {/* Summary */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card p-3">
              <div className="skeleton h-3 w-16 mb-2" />
              <div className="skeleton h-7 w-12 mb-1" />
              <div className="skeleton h-3 w-20" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5 animate-fade-in">
          {[
            { label: t('dash.totalLines'), value: `${overall?.activeLines ?? 0}/${overall?.totalLines ?? 0}`, sub: t('managerPage.active'), color: '' },
            { label: t('styleCard.outputToday'), value: (overall?.totalOutput ?? 0).toLocaleString(), sub: t('common.pairs'), color: 'text-teal' },
            { label: t('monitor.avgLler'), value: `${overall?.avgLler ?? 0}%`, sub: '', color: (overall?.avgLler ?? 0) >= 85 ? 'text-teal' : (overall?.avgLler ?? 0) >= 70 ? 'text-amber-600' : 'text-red-600' },
            { label: t('dash.totalAlerts'), value: overall?.totalAlerts ?? 0, sub: '', color: (overall?.totalAlerts ?? 0) > 0 ? 'text-red-600' : '' },
            { label: t('managerPage.criticalLines'), value: overall?.criticalLines ?? 0, sub: 'LLER < 75%', color: (overall?.criticalLines ?? 0) > 0 ? 'text-red-600' : '' },
            { label: t('managerPage.activeBuildings'), value: buildings.filter(b => b.summary.activeLines > 0).length, sub: t('monitor.ofTotal', { n: buildings.length }), color: '' },
          ].map(m => (
            <div key={m.label} className="card p-3">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{m.label}</div>
              <div className={`text-2xl font-semibold ${m.color || 'text-gray-900'}`}>{m.value}</div>
              {m.sub && <div className="text-xs text-gray-400 mt-1">{m.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {/* ── LLER TREND CHARTS ── */}
      {!loading && trend && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5 animate-fade-in">
          {/* Chart A: Hourly trend hari ini */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-semibold text-gray-800">{t('managerPage.trendToday')}</div>
                <div className="text-xs text-gray-400 mt-0.5">{t('managerPage.perHourPoints', { n: trend.hourly.length })}</div>
              </div>
              <div className="text-xs text-gray-500">
                {trend.hourly.length > 0
                  ? `Latest: ${trend.hourly[trend.hourly.length - 1].lller}%`
                  : '—'}
              </div>
            </div>
            {trend.hourly.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-xs text-gray-400">
                {t('status.noDataYet')}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trend.hourly} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="hourlyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickFormatter={(h: number) => `${h}:00`} stroke="#9CA3AF" />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 'dataMax + 10']} stroke="#9CA3AF" />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                    labelFormatter={(h: number) => `Jam ${h}:00`}
                    formatter={(v: any, name: string) => {
                      if (name === 'lller') return [`${v}%`, 'LLER']
                      return [v, name]
                    }}
                  />
                  <ReferenceLine y={85} stroke="#EF9F27" strokeDasharray="3 3" label={{ value: 'Target 85%', position: 'right', fontSize: 10, fill: '#EF9F27' }} />
                  <Area type="monotone" dataKey="lller" stroke="#3B82F6" strokeWidth={2} fill="url(#hourlyGrad)" dot={{ r: 3, fill: '#3B82F6' }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Chart B: Daily trend 14 hari */}
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-semibold text-gray-800">{t('managerPage.trend14d')}</div>
                <div className="text-xs text-gray-400 mt-0.5">{t('managerPage.perDayAgg')}</div>
              </div>
              {(() => {
                const lastN = trend.daily.filter(d => d.lller > 0).slice(-7)
                if (lastN.length < 2) return null
                const first = lastN[0].lller
                const last = lastN[lastN.length - 1].lller
                const diff = last - first
                return (
                  <div className={`text-xs font-medium ${diff > 0 ? 'text-teal' : diff < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                    {diff > 0 ? '↑' : diff < 0 ? '↓' : '→'} {diff > 0 ? '+' : ''}{diff}% {t('managerPage.vsWeekStart')}
                  </div>
                )
              })()}
            </div>
            {trend.daily.filter(d => d.lller > 0).length === 0 ? (
              <div className="h-48 flex items-center justify-center text-xs text-gray-400">
                {t('analytics.noHistory')}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trend.daily} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(d: string) => {
                      const [, m, day] = d.split('-')
                      return `${parseInt(day)}/${parseInt(m)}`
                    }}
                    stroke="#9CA3AF"
                  />
                  <YAxis tick={{ fontSize: 11 }} domain={[0, 'dataMax + 10']} stroke="#9CA3AF" />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                    labelFormatter={(d: string) => {
                      const dt = new Date(d)
                      return dt.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })
                    }}
                    formatter={(v: any, name: string) => {
                      if (name === 'lller') return [v > 0 ? `${v}%` : '—', 'LLER']
                      return [v, name]
                    }}
                  />
                  <ReferenceLine y={85} stroke="#EF9F27" strokeDasharray="3 3" />
                  <Line
                    type="monotone" dataKey="lller" stroke="#3B82F6" strokeWidth={2}
                    dot={(props: any) => {
                      const { cx, cy, payload } = props
                      if (!payload || payload.lller === 0) return <></>
                      return <circle cx={cx} cy={cy} r={3} fill="#3B82F6" />
                    }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* Building filter — hanya kalau akses semua gedung */}
      {!userBuilding && (
        <div className="flex gap-1 mb-4 flex-wrap">
          {['ALL', ...Object.keys(BUILDINGS)].map(b => (
            <button key={b} onClick={() => setSelBuilding(b)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${selBuilding === b ? 'bg-teal text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {b === 'ALL' ? t('common.all') : t('monitor.bldg', { b })}
            </button>
          ))}
        </div>
      )}

      {/* Critical banner */}
      {!loading && (overall?.criticalLines ?? 0) > 0 && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-100 rounded-xl animate-fade-in">
          <div className="text-sm font-medium text-red-700 mb-2">⚠ {t('managerPage.criticalBanner', { n: overall?.criticalLines ?? 0 })}</div>
          <div className="flex flex-wrap gap-2">
            {buildings.flatMap(b => b.lines.filter(l => l.status === 'critical')).slice(0, 8).map(l => (
              <Link key={l.id} href={`/lines/${l.building}/${l.lineNo}`}
                className="text-xs px-2.5 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200">
                Gdg {l.building} L{l.lineNo} — {l.ller}%
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Buildings */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card border border-gray-100 p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="skeleton w-2.5 h-2.5 rounded-full" />
                <div className="skeleton h-4 w-16" />
              </div>
              <div className="skeleton h-8 w-full mb-2" />
              <div className="skeleton h-1.5 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6 animate-fade-in">
          {filtered.map(b => (
            <div key={b.building}>
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <h2 className="text-base font-semibold text-gray-800">{t('monitor.building', { b: b.building })}</h2>
                {b.building === 'G' && <span className="badge badge-warn text-xs">Stockfit</span>}
                <div className="flex gap-2 text-xs text-gray-500 flex-wrap">
                  <span>{b.summary.activeLines}/{b.summary.totalLines} {t('managerPage.active')}</span>
                  <span>·</span>
                  <span className={`font-medium ${b.summary.avgLler >= 85 ? 'text-teal' : b.summary.avgLler >= 70 ? 'text-amber-600' : b.summary.avgLler > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {b.summary.avgLler > 0 ? `avg ${b.summary.avgLler}% LLER` : t('common.noData').toLowerCase()}
                  </span>
                  <span>·</span>
                  <span className="font-medium text-gray-700">{b.summary.totalOutput.toLocaleString()} pairs</span>
                  {b.summary.totalAlerts > 0 && (
                    <><span>·</span><span className="text-red-600 font-medium">{b.summary.totalAlerts} alert</span></>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {b.lines.sort((a, c) => a.lineNo - c.lineNo).map(line => {
                  const st = STATUS_CONFIG[line.status as keyof typeof STATUS_CONFIG]
                  return (
                    <Link key={line.id} href={`/lines/${line.building}/${line.lineNo}`}
                      className={`card border ${st.border} ${st.bg} p-3 hover:shadow-md transition-all`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${st.dot}`} />
                          <span className="font-semibold text-sm text-gray-900">{t('monitor.line', { n: line.lineNo })}</span>
                          {line.model && <span className="text-xs text-gray-400">{line.model.name}</span>}
                        </div>
                        {line.alerts.length > 0 && (
                          <span className="w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                            {line.alerts.length}
                          </span>
                        )}
                      </div>

                      {line.status === 'no_model' ? (
                        <div className="text-xs text-gray-400">{t('monitor.noModel')}</div>
                      ) : line.status === 'no_input' ? (
                        <div className="text-xs text-amber-600">{t('managerPage.noInputToday')}</div>
                      ) : (
                        <>
                          <div className="grid grid-cols-3 gap-1 mb-2">
                            <div className="text-center">
                              <div className={`text-lg font-bold ${st.text}`}>{line.ller}%</div>
                              <div className="text-xs text-gray-400">LLER</div>
                            </div>
                            <div className="text-center">
                              <div className="text-lg font-bold text-gray-900">{line.lastOutput}</div>
                              <div className="text-xs text-gray-400">{t('managerPage.thisHour')}</div>
                            </div>
                            <div className="text-center">
                              <div className={`text-lg font-bold ${line.lastOutput - line.tph >= 0 ? 'text-teal' : 'text-red-600'}`}>
                                {line.lastOutput - line.tph >= 0 ? '+' : ''}{line.lastOutput - line.tph}
                              </div>
                              <div className="text-xs text-gray-400">{t('monitor.vsTarget')}</div>
                            </div>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1.5">
                            <div className={`h-1.5 rounded-full transition-all ${line.ller >= 90 ? 'bg-teal' : line.ller >= 75 ? 'bg-yellow-400' : 'bg-red-500'}`}
                              style={{ width: `${Math.min(line.ller, 100)}%` }} />
                          </div>
                          <div className="flex gap-2 text-xs text-gray-400">
                            <span>{t('monitor.total')}: <strong className="text-gray-600">{line.todayOutput}</strong></span>
                            <span>{line.hoursInput} {t('common.hours')}</span>
                            {line.todayDowntime > 0 && <span className="text-amber-600">DT: {line.todayDowntime}m</span>}
                            {line.todayDefect > 0 && <span className="text-red-500">Def: {line.todayDefect}</span>}
                          </div>
                        </>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}