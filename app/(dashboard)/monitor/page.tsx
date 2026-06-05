'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { BUILDINGS } from '@/lib/utils'

type LineStatus = {
  id: string; building: string; lineNo: number; lineType: string
  model: { name: string; lineType: string } | null
  latestActual: { output: number; mpActual: number; hour: number; section: string } | null
  todayTotals: { output: number; downtime: number; defect: number; hours: number; avgMP: number }
  alerts: { type: string; message: string }[]
  ller: number; gap: number; targetPPH: number
}

function statusColor(ller: number, hasModel: boolean, hasActual: boolean) {
  if (!hasModel) return { bg: 'bg-gray-50', border: 'border-gray-100', dot: 'bg-gray-300', text: 'text-gray-400' }
  if (!hasActual) return { bg: 'bg-amber-50', border: 'border-amber-100', dot: 'bg-amber-300', text: 'text-amber-700' }
  if (ller >= 90) return { bg: 'bg-green-50', border: 'border-green-100', dot: 'bg-teal', text: 'text-green-800' }
  if (ller >= 75) return { bg: 'bg-yellow-50', border: 'border-yellow-100', dot: 'bg-yellow-400', text: 'text-yellow-800' }
  return { bg: 'bg-red-50', border: 'border-red-100', dot: 'bg-red-500', text: 'text-red-800' }
}

export default function MonitorPage() {
  const [lines, setLines] = useState<LineStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [selBuilding, setSelBuilding] = useState<string>('ALL')
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchData = useCallback(async () => {
    const res = await fetch('/api/monitor')
    if (res.ok) {
      const data = await res.json()
      setLines(data)
      setLastUpdate(new Date())
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(fetchData, 60000) // refresh tiap 1 menit
    return () => clearInterval(t)
  }, [autoRefresh, fetchData])

  const filtered = selBuilding === 'ALL' ? lines : lines.filter(l => l.building === selBuilding)

  // Summary metrics
  const withModel  = lines.filter(l => l.model)
  const withActual = lines.filter(l => l.latestActual)
  const totalOut   = lines.reduce((s, l) => s + l.todayTotals.output, 0)
  const avgLler    = withActual.length ? Math.round(withActual.reduce((s, l) => s + l.ller, 0) / withActual.length) : 0
  const totalAlerts = lines.reduce((s, l) => s + l.alerts.length, 0)
  const critical   = lines.filter(l => l.ller < 75 && l.latestActual)

  // Group by building
  const byBuilding = filtered.reduce((acc, l) => {
    if (!acc[l.building]) acc[l.building] = []
    acc[l.building].push(l)
    return acc
  }, {} as Record<string, LineStatus[]>)

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
      Memuat data monitor...
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Monitor lini</h1>
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-2">
            {lastUpdate ? `Update terakhir: ${lastUpdate.toLocaleTimeString('id-ID')}` : 'Memuat...'}
            <button onClick={() => setAutoRefresh(a => !a)}
              className={`px-2 py-0.5 rounded text-xs border ${autoRefresh ? 'bg-teal-light border-teal text-teal-dark' : 'bg-gray-100 border-gray-200 text-gray-500'}`}>
              {autoRefresh ? '● Auto-refresh aktif' : '○ Auto-refresh mati'}
            </button>
            <button onClick={fetchData} className="px-2 py-0.5 rounded text-xs border border-gray-200 hover:bg-gray-50">↺ Refresh</button>
          </p>
        </div>
        <a href="/api/export/daily" className="btn btn-secondary text-sm">↓ Export laporan hari ini</a>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Line aktif', value: withActual.length + ' / ' + withModel.length, sub: 'dari ' + lines.length + ' total', color: '' },
          { label: 'Total output hari ini', value: totalOut.toLocaleString(), sub: 'pairs', color: 'text-teal' },
          { label: 'Avg LLER', value: avgLler + '%', sub: withActual.length + ' line dengan data', color: avgLler >= 90 ? 'text-teal' : avgLler >= 75 ? 'text-amber-600' : 'text-red-600' },
          { label: 'Alert aktif', value: totalAlerts, sub: critical.length + ' line LLER < 75%', color: totalAlerts > 0 ? 'text-red-600' : 'text-gray-900' },
        ].map(m => (
          <div key={m.label} className="card p-3">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{m.label}</div>
            <div className={`text-2xl font-semibold ${m.color || 'text-gray-900'}`}>{m.value}</div>
            <div className="text-xs text-gray-400 mt-1">{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Legend + building filter */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex gap-3 text-xs text-gray-500">
          {[['bg-teal','LLER ≥ 90%'],['bg-yellow-400','75–90%'],['bg-red-500','< 75%'],['bg-amber-300','Ada model, belum input'],['bg-gray-300','Kosong']].map(([c,l]) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${c}`}/>
              {l}
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          {['ALL', ...Object.keys(BUILDINGS)].map(b => (
            <button key={b} onClick={() => setSelBuilding(b)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${selBuilding === b ? 'bg-teal text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {b === 'ALL' ? 'Semua' : `Gdg ${b}`}
            </button>
          ))}
        </div>
      </div>

      {/* Critical alerts banner */}
      {critical.length > 0 && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-100 rounded-xl">
          <div className="text-sm font-medium text-red-700 mb-2">⚠ {critical.length} line butuh perhatian (LLER &lt; 75%)</div>
          <div className="flex flex-wrap gap-2">
            {critical.map(l => (
              <Link key={l.id} href={`/lines/${l.building}/${l.lineNo}`}
                className="text-xs px-2.5 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200">
                Gdg {l.building} Line {l.lineNo} — {l.ller}%
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Lines by building */}
      {Object.entries(byBuilding)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([building, bLines]) => (
        <div key={building} className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-sm font-semibold text-gray-700">Gedung {building}</h2>
            {building === 'G' && <span className="badge badge-warn text-xs">Stockfit</span>}
            <span className="text-xs text-gray-400">{bLines.length} line</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {bLines.sort((a, b) => a.lineNo - b.lineNo).map(line => {
              const st = statusColor(line.ller, !!line.model, !!line.latestActual)
              const tph = line.targetPPH ?? 0
              return (
                <Link key={line.id} href={`/lines/${line.building}/${line.lineNo}`}
                  className={`card border ${st.border} ${st.bg} p-3 hover:shadow-md transition-shadow`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${st.dot}`}/>
                      <span className="font-medium text-sm text-gray-900">Line {line.lineNo}</span>
                      {line.model && (
                        <span className="text-xs text-gray-500">{line.model.name}</span>
                      )}
                    </div>
                    {line.alerts.length > 0 && (
                      <span className="flex items-center justify-center w-5 h-5 bg-red-500 text-white text-xs rounded-full flex-shrink-0">
                        {line.alerts.length}
                      </span>
                    )}
                  </div>

                  {!line.model ? (
                    <div className="text-xs text-gray-400">Belum ada model</div>
                  ) : !line.latestActual ? (
                    <div className="text-xs text-amber-600">Model: {line.model.name} — belum ada input hari ini</div>
                  ) : (
                    <>
                      {/* Metrics */}
                      <div className="grid grid-cols-3 gap-1 mb-2">
                        <div className="text-center">
                          <div className={`text-lg font-semibold ${st.text}`}>{line.ller}%</div>
                          <div className="text-xs text-gray-400">LLER</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-semibold text-gray-900">{line.latestActual.output}</div>
                          <div className="text-xs text-gray-400">Jam {line.latestActual.hour}:00</div>
                        </div>
                        <div className="text-center">
                          <div className={`text-lg font-semibold ${line.gap >= 0 ? 'text-teal' : 'text-red-600'}`}>
                            {line.gap >= 0 ? '+' : ''}{line.gap}
                          </div>
                          <div className="text-xs text-gray-400">vs target</div>
                        </div>
                      </div>

                      {/* Progress bar LLER */}
                      <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
                        <div className={`h-1.5 rounded-full transition-all ${line.ller >= 90 ? 'bg-teal' : line.ller >= 75 ? 'bg-yellow-400' : 'bg-red-500'}`}
                          style={{ width: Math.min(line.ller, 100) + '%' }} />
                      </div>

                      {/* Today totals */}
                      <div className="flex gap-3 text-xs text-gray-500">
                        <span>Total: <strong className="text-gray-700">{line.todayTotals.output}</strong> pairs</span>
                        <span>MP: <strong className="text-gray-700">{line.todayTotals.avgMP}</strong></span>
                        {line.todayTotals.downtime > 0 && (
                          <span className="text-amber-600">DT: <strong>{line.todayTotals.downtime}m</strong></span>
                        )}
                        {line.todayTotals.defect > 0 && (
                          <span className="text-red-500">Defect: <strong>{line.todayTotals.defect}</strong></span>
                        )}
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
  )
}
