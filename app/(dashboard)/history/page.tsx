'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { History, Mail, MailX, TrendingUp, X, Download } from 'lucide-react'
import { BUILDINGS } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'

type Archive = {
  id: string
  lineId: string
  date: string
  shift: number
  shiftLabel: string
  building: string
  lineNo: number
  sections: string[]
  models: string[]
  target: number | null
  achievement: number | null
  closedByName: string
  closedAt: string
  totalOutput: number
  totalDT: number
  totalDefect: number
  avgLler: number
  emailSent: boolean
}

type DetailRow = {
  hour: number; model: string; section: string; output: number; target: number
  stdMP: number; theoMP: number; mpActual: number; lller: number
  downtime: number; dtReason: string; defect: number
}

function llerColor(ller: number) {
  if (ller >= 90) return 'text-emerald-600'
  if (ller >= 75) return 'text-amber-600'
  return 'text-red-600'
}
function achColor(pct: number | null) {
  if (pct === null) return 'text-gray-400'
  if (pct >= 100) return 'text-emerald-600'
  if (pct >= 85) return 'text-amber-600'
  return 'text-red-600'
}

export default function HistoryPage() {
  const { t, locale } = useI18n()
  const [archives, setArchives] = useState<Archive[]>([])
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  // Filters (client-side, di atas data yang sudah di-fetch)
  const [selBuilding, setSelBuilding] = useState('ALL')
  const [selLine, setSelLine] = useState('ALL')
  const [selShift, setSelShift] = useState('ALL')
  const [selDate, setSelDate] = useState('') // YYYY-MM-DD; kosong = semua

  // Detail modal
  const [detail, setDetail] = useState<Archive | null>(null)
  const [detailRows, setDetailRows] = useState<DetailRow[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  const openDetail = useCallback(async (a: Archive) => {
    setDetail(a); setDetailRows([]); setDetailLoading(true)
    try {
      const res = await fetch(`/api/shift-archive/detail?lineId=${a.lineId}&date=${a.date}&shift=${a.shift}`)
      if (res.ok) { const d = await res.json(); setDetailRows(d.rows ?? []) }
    } catch {}
    setDetailLoading(false)
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/shift-archive?building=${selBuilding}&days=${days}`)
      if (res.ok) {
        const data = await res.json()
        setArchives(data.archives ?? [])
      }
    } catch {}
    setLoading(false)
  }, [selBuilding, days])

  useEffect(() => { fetchData() }, [fetchData])

  // Opsi line & shift dari data
  const lineOpts = useMemo(() => {
    const set = new Set(archives.map(a => `${a.building}|${a.lineNo}`))
    return [...set].sort().map(k => { const [b, n] = k.split('|'); return { key: k, building: b, lineNo: Number(n) } })
  }, [archives])
  const shiftOpts = useMemo(() => [...new Set(archives.map(a => a.shiftLabel))].sort(), [archives])

  const filtered = archives.filter(a => {
    if (selBuilding !== 'ALL' && a.building !== selBuilding) return false
    if (selLine !== 'ALL' && `${a.building}|${a.lineNo}` !== selLine) return false
    if (selShift !== 'ALL' && a.shiftLabel !== selShift) return false
    if (selDate && a.date !== selDate) return false
    return true
  })

  // Summary
  const totalShifts = filtered.length
  const avgLler = totalShifts > 0
    ? Math.round(filtered.reduce((s, a) => s + a.avgLler, 0) / totalShifts) : 0
  const totalOutput = filtered.reduce((s, a) => s + a.totalOutput, 0)
  const totalDT = filtered.reduce((s, a) => s + a.totalDT, 0)

  const dateLocale = locale === 'id' ? 'id-ID' : locale

  // API detail sudah memfilter per shift; client hanya menampilkan hasilnya.
  const shiftDetailRows = detailRows

  const hasActiveFilter = selBuilding !== 'ALL' || selLine !== 'ALL' || selShift !== 'ALL' || !!selDate
  const resetFilters = () => { setSelBuilding('ALL'); setSelLine('ALL'); setSelShift('ALL'); setSelDate('') }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900">
            <History className="w-6 h-6 text-blue-600" /> {t('history.title')}
          </h1>
          <p className="text-xs text-gray-400 mt-1">{t('history.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${days === d ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {t('analytics.daysN', { n: d })}
              </button>
            ))}
          </div>
          <a
            href={`/api/export/shift-history?building=${selBuilding}&days=${days}&line=${encodeURIComponent(selLine)}&shift=${encodeURIComponent(selShift)}&date=${selDate}`}
            className={`btn btn-primary text-sm ${filtered.length === 0 ? 'pointer-events-none opacity-50' : ''}`}>
            <Download className="w-4 h-4" /> {t('history.exportExcel')}
          </a>
        </div>
      </div>

      {/* Filter bar */}
      <div className="card p-3 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">{t('user.building')}</label>
          <select className="input w-32 text-sm" value={selBuilding} onChange={e => { setSelBuilding(e.target.value); setSelLine('ALL') }}>
            <option value="ALL">{t('nav.allBuildings')}</option>
            {Object.keys(BUILDINGS).map(b => <option key={b} value={b}>{t('monitor.building', { b })}</option>)}
          </select>
        </div>
        <div>
          <label className="label">{t('history.colLine')}</label>
          <select className="input w-36 text-sm" value={selLine} onChange={e => setSelLine(e.target.value)}>
            <option value="ALL">{t('history.allLines')}</option>
            {lineOpts.filter(l => selBuilding === 'ALL' || l.building === selBuilding).map(l => (
              <option key={l.key} value={l.key}>{t('monitor.bldg', { b: l.building })} L{l.lineNo}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t('history.colShift')}</label>
          <select className="input w-32 text-sm" value={selShift} onChange={e => setSelShift(e.target.value)}>
            <option value="ALL">{t('history.allShifts')}</option>
            {shiftOpts.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="label">{t('history.filterDate')}</label>
          <input type="date" className="input w-40 text-sm" value={selDate} onChange={e => setSelDate(e.target.value)} />
        </div>
        {hasActiveFilter && (
          <button onClick={resetFilters} className="btn btn-secondary text-xs h-9">
            <X className="w-3.5 h-3.5" /> {t('history.resetFilter')}
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {[
          { label: t('history.totalShifts'), value: totalShifts.toString(), color: '' },
          { label: t('history.avgLler'), value: avgLler + '%', color: llerColor(avgLler) },
          { label: t('history.totalOutput'), value: totalOutput.toLocaleString(), color: 'text-blue-600' },
          { label: t('history.totalDt'), value: totalDT.toLocaleString() + ' ' + t('common.minutes'), color: totalDT > 0 ? 'text-amber-600' : '' },
        ].map(m => (
          <div key={m.label} className="card p-3">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">{m.label}</div>
            <div className={`text-2xl font-semibold ${m.color || 'text-gray-900'}`}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="card p-12 text-center text-gray-400 text-sm">{t('common.loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <TrendingUp className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <div className="font-medium mb-1">{t('history.empty')}</div>
          <p className="text-sm">{t('history.emptyHint')}</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {[
                    t('history.colDate'), t('history.colLine'), t('history.colShift'), 'Model', t('history.colSection'),
                    t('history.colOutput'), t('history.colTarget'), t('history.colAch'), 'LLER', 'DT', t('leader.defect'),
                    t('history.colClosedBy'), t('history.colReport'),
                  ].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 text-xs text-gray-500 font-medium uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => (
                  <tr key={a.id} onClick={() => openDetail(a)}
                    className="border-b border-gray-50 hover:bg-blue-50/40 cursor-pointer">
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">
                      {new Date(a.date + 'T00:00:00+07:00').toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-medium text-gray-900">
                      {t('monitor.bldg', { b: a.building })} L{a.lineNo}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-500">{a.shiftLabel}</td>
                    <td className="px-3 py-2.5 text-gray-600 text-xs">
                      {a.models.length > 0
                        ? <div className="flex flex-wrap gap-1">{a.models.map(m => (
                            <span key={m} className="inline-block px-1.5 py-0.5 bg-violet-50 text-violet-700 rounded">{m}</span>
                          ))}</div>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 text-xs">
                      {a.sections.length > 0
                        ? <div className="flex flex-wrap gap-1">{a.sections.map(s => (
                            <span key={s} className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">{s}</span>
                          ))}</div>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-medium">{a.totalOutput.toLocaleString()}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{a.target ? a.target.toLocaleString() : '—'}</td>
                    <td className={`px-3 py-2.5 whitespace-nowrap font-semibold ${achColor(a.achievement)}`}>
                      {a.achievement !== null ? `${a.achievement}%` : '—'}
                    </td>
                    <td className={`px-3 py-2.5 whitespace-nowrap font-semibold ${llerColor(a.avgLler)}`}>{a.avgLler}%</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{a.totalDT}m</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-600">{a.totalDefect}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-500 text-xs">{a.closedByName}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {a.emailSent
                        ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><Mail className="w-3.5 h-3.5" /> {t('history.sent')}</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-gray-400"><MailX className="w-3.5 h-3.5" /> {t('history.notSent')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Detail modal: rincian per jam ── */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-auto"
          onClick={() => setDetail(null)}>
          <div className="bg-white rounded-xl w-full max-w-4xl my-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <div className="text-base font-semibold text-gray-900">
                  {t('monitor.bldg', { b: detail.building })} L{detail.lineNo} · {detail.shiftLabel}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {new Date(detail.date + 'T00:00:00+07:00').toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  {detail.target ? ` · ${t('history.colTarget')}: ${detail.target.toLocaleString()}` : ''}
                </div>
                {detail.models.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {detail.models.map(m => (
                      <span key={m} className="px-2 py-0.5 rounded bg-violet-50 text-violet-700 text-xs">{m}</span>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-700 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5">
              {detailLoading ? (
                <div className="py-10 text-center text-gray-400 text-sm">{t('common.loading')}</div>
              ) : shiftDetailRows.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-sm">{t('common.noData')}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {[
                          t('history.dHour'), 'Model', t('history.colSection'), t('history.dOutput'), t('history.colTarget'),
                          t('history.dStdMp'), t('history.dTheoMp'), t('history.dMpAct'), 'LLER', 'DT', t('leader.defect'),
                        ].map(h => (
                          <th key={h} className="text-left px-2.5 py-2 text-xs text-gray-500 font-medium uppercase whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {shiftDetailRows.map((r, i) => {
                        const gap = r.output - r.target
                        // Jam virtual shift malam (24-32) → jam asli + penanda hari berikutnya
                        const hourLabel = r.hour < 24
                          ? `${String(r.hour).padStart(2, '0')}:00`
                          : `${String(r.hour - 24).padStart(2, '0')}:00 ⁺¹`
                        return (
                          <tr key={i} className="border-b border-gray-50">
                            <td className="px-2.5 py-2 whitespace-nowrap font-medium text-gray-700">{hourLabel}</td>
                            <td className="px-2.5 py-2 whitespace-nowrap text-violet-700 text-xs font-medium">{r.model}</td>
                            <td className="px-2.5 py-2 whitespace-nowrap text-gray-500 text-xs">{r.section}</td>
                            <td className="px-2.5 py-2 whitespace-nowrap">
                              <span className="font-medium">{r.output}</span>
                              <span className={`ml-1 text-xs ${gap >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{gap >= 0 ? '+' : ''}{gap}</span>
                            </td>
                            <td className="px-2.5 py-2 whitespace-nowrap text-gray-500">{r.target}</td>
                            <td className="px-2.5 py-2 whitespace-nowrap text-gray-500">{r.stdMP}</td>
                            <td className="px-2.5 py-2 whitespace-nowrap text-gray-500">{r.theoMP}</td>
                            <td className="px-2.5 py-2 whitespace-nowrap font-medium text-gray-800">{r.mpActual}</td>
                            <td className={`px-2.5 py-2 whitespace-nowrap font-semibold ${llerColor(r.lller)}`}>{r.lller}%</td>
                            <td className="px-2.5 py-2 whitespace-nowrap text-gray-500">
                              {r.downtime > 0 ? <span className="text-amber-600">{r.downtime}m</span> : '0'}
                              {r.dtReason ? <span className="text-gray-400 text-xs"> ({r.dtReason})</span> : ''}
                            </td>
                            <td className="px-2.5 py-2 whitespace-nowrap">{r.defect > 0 ? <span className="text-red-600">{r.defect}</span> : '0'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
