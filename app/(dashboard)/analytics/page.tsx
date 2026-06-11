'use client'
import { useState, useEffect } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts'
import { BUILDINGS } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'

type DayData = { date: string; avgLler: number; totalOutput: number; totalDefect: number; activeLines: number; totalDowntime: number }
type LineData = { building: string; lineNo: number; modelName: string; avgLler: number; totalOutput: number; hours: number }
type AlertSummary = { type: string; count: number }

export default function AnalyticsPage() {
  const { t } = useI18n()
  const [days, setDays]     = useState<DayData[]>([])
  const [linePerf, setLinePerf] = useState<LineData[]>([])
  const [alerts, setAlerts] = useState<AlertSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(7)
  const [selBuilding, setSelBuilding] = useState('ALL')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/analytics/summary?days=${period}&building=${selBuilding}`)
      .then(r => r.json())
      .then(d => { setDays(d.days ?? []); setLinePerf(d.lines ?? []); setAlerts(d.alerts ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [period, selBuilding])

  const avgLler  = days.length ? Math.round(days.reduce((s, d) => s + d.avgLler, 0) / days.length) : 0
  const totOut   = days.reduce((s, d) => s + d.totalOutput, 0)
  const totDT    = days.reduce((s, d) => s + d.totalDowntime, 0)
  const totDef   = days.reduce((s, d) => s + d.totalDefect, 0)
  const defRate  = totOut > 0 ? (totDef / totOut * 100).toFixed(2) : '0'
  const topLines = [...linePerf].sort((a, b) => b.avgLler - a.avgLler).slice(0, 5)
  const botLines = [...linePerf].sort((a, b) => a.avgLler - b.avgLler).filter(l => l.hours > 0).slice(0, 5)

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-white border border-gray-100 rounded-lg shadow-lg p-3 text-xs">
        <p className="font-medium text-gray-700 mb-1">{label}</p>
        {payload.map((p: any) => <p key={p.name} style={{ color: p.color }}>{p.name}: <strong>{p.value}{p.name === 'LLER' ? '%' : ''}</strong></p>)}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t('nav.analytics')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('analytics.subtitle')}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {[7, 14, 30].map(d => (
              <button key={d} onClick={() => setPeriod(d)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${period === d ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {t('analytics.daysN', { n: d })}
              </button>
            ))}
          </div>
          <select className="input text-xs w-32" value={selBuilding} onChange={e => setSelBuilding(e.target.value)}>
            <option value="ALL">{t('nav.allBuildings')}</option>
            {Object.keys(BUILDINGS).map(b => <option key={b} value={b}>{t('monitor.building', { b })}</option>)}
          </select>
          <a href={`/api/export/daily`} className="btn btn-secondary text-xs">↓ {t('monitor.exportToday')}</a>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: t('analytics.avgLlerDays', { n: period }), value: avgLler + '%', color: avgLler >= 85 ? 'text-teal' : avgLler >= 70 ? 'text-amber-600' : 'text-red-600' },
          { label: t('status.totalOutput'), value: totOut.toLocaleString() + ' ' + t('common.pairs'), color: '' },
          { label: t('status.totalDT'), value: totDT + ' ' + t('common.minutes'), color: totDT > 100 ? 'text-amber-600' : '' },
          { label: t('analytics.defectRate'), value: defRate + '%', color: parseFloat(defRate) > 2 ? 'text-red-600' : 'text-teal' },
        ].map(m => (
          <div key={m.label} className="card p-3">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{m.label}</div>
            <div className={`text-2xl font-semibold ${m.color || 'text-gray-900'}`}>{m.value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">{t('analytics.loading')}</div>
      ) : days.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <div className="text-4xl mb-3">📊</div>
          <div className="font-medium mb-2">{t('analytics.noHistory')}</div>
          <p className="text-sm">{t('analytics.noHistoryHint')}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* LLER Trend */}
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('analytics.llerTrend')}</h2>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={days} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={85} stroke="#3B82F6" strokeDasharray="4 3" label={{ value: 'Target 85%', fill: '#3B82F6', fontSize: 10 }} />
                  <Line type="monotone" dataKey="avgLler" name="LLER" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Output trend */}
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('analytics.outputDowntime')}</h2>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={days} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="totalOutput" name="Output (pairs)" fill="#3B82F6" maxBarSize={40} radius={[2, 2, 0, 0]} />
                  <Bar dataKey="totalDowntime" name="Downtime (mnt)" fill="#EF9F27" maxBarSize={40} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top & bottom lines */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">🏆 {t('analytics.topLines')}</h2>
              {topLines.length === 0 ? (
                <p className="text-sm text-gray-400">{t('common.noData')}</p>
              ) : (
                <div className="space-y-2">
                  {topLines.map((l, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${i === 0 ? 'bg-yellow-400' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-amber-600' : 'bg-gray-200'}`}>{i+1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-800">Gdg {l.building} L{l.lineNo} <span className="text-gray-400 font-normal">— {l.modelName}</span></span>
                          <span className={`text-sm font-semibold ${l.avgLler >= 85 ? 'text-teal' : 'text-amber-600'}`}>{l.avgLler}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                          <div className="bg-teal h-1.5 rounded-full" style={{ width: Math.min(l.avgLler, 100) + '%' }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">⚠ {t('analytics.botLines')}</h2>
              {botLines.length === 0 ? (
                <p className="text-sm text-gray-400">{t('common.noData')}</p>
              ) : (
                <div className="space-y-2">
                  {botLines.map((l, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center text-xs font-bold text-red-600 flex-shrink-0">!</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-800">Gdg {l.building} L{l.lineNo} <span className="text-gray-400 font-normal">— {l.modelName}</span></span>
                          <span className={`text-sm font-semibold ${l.avgLler < 75 ? 'text-red-600' : 'text-amber-600'}`}>{l.avgLler}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                          <div className={`h-1.5 rounded-full ${l.avgLler < 75 ? 'bg-red-400' : 'bg-amber-400'}`} style={{ width: Math.min(l.avgLler, 100) + '%' }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Alert frequency */}
          {alerts.length > 0 && (
            <div className="card p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('analytics.alertFreq', { n: period })}</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {alerts.map(a => (
                  <div key={a.type} className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-semibold text-red-600">{a.count}</div>
                    <div className="text-xs text-gray-500 mt-1">{a.type.replace('_', ' ')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
