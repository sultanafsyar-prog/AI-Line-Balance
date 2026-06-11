'use client'
import { useState, useEffect } from 'react'
import { BUILDINGS, today } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'

type Line = { id: string; building: string; lineNo: number; model: { name: string; lineType: string } | null; sections: { id: string; name: string; stdMP: number; taktTime: number }[] }

const DT_REASONS = [
  { value: 'Mesin rusak',     key: 'inputPage.dtMachine' },
  { value: 'Material kurang', key: 'inputPage.dtMaterial' },
  { value: 'Style change',    key: 'inputPage.dtStyleChange' },
  { value: 'QC hold',         key: 'inputPage.dtQcHold' },
  { value: 'Operator kurang', key: 'inputPage.dtOperator' },
  { value: 'Lainnya',         key: 'inputPage.dtOther' },
]
const SHIFT_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
const OT_HOURS    = [17, 18, 19]

export default function InputPage() {
  const { t, locale } = useI18n()
  const [lines, setLines]   = useState<Line[]>([])
  const [loading, setLoading] = useState(true)
  const [selBuilding, setSelBuilding] = useState('')
  const [selLineId, setSelLineId]     = useState('')
  const [selSecId, setSelSecId]       = useState('')
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')

  const [form, setForm] = useState({
    hour: String(new Date().getHours()),
    output: '', mpActual: '', downtime: '0', dtReason: '', defect: '0',
  })

  useEffect(() => {
    fetch('/api/lines').then(r => r.json()).then((data: any[]) => {
      const mapped: Line[] = data.map(l => ({
        id: l.id, building: l.building, lineNo: l.lineNo,
        model: l.assignments?.[0]?.model ?? null,
        sections: l.assignments?.[0]?.model?.sections ?? [],
      }))
      setLines(mapped)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const buildings = [...new Set(lines.map(l => l.building))].sort()
  const filteredLines = lines.filter(l => l.building === selBuilding && l.model)
  const selLine  = lines.find(l => l.id === selLineId)
  const selSec   = selLine?.sections.find(s => s.id === selSecId)
  const tph      = selSec?.taktTime && selSec.taktTime > 0 ? Math.round(3600 / selSec.taktTime) : 0

  // Auto-select first building with lines that have model
  useEffect(() => {
    if (!selBuilding && buildings.length > 0) {
      const first = buildings.find(b => lines.some(l => l.building === b && l.model))
      if (first) setSelBuilding(first)
    }
  }, [buildings, lines, selBuilding])

  // Auto-select first line when building changes or lines load
  useEffect(() => {
    if (selBuilding) {
      const fl = lines.filter(l => l.building === selBuilding && l.model)[0]
      setSelLineId(fl?.id ?? '')
      setSelSecId(fl?.sections[0]?.id ?? '')
    }
  }, [selBuilding, lines])

  // Auto-select first section when line changes
  useEffect(() => {
    if (selLineId) {
      const sl = lines.find(l => l.id === selLineId)
      setSelSecId(sl?.sections[0]?.id ?? '')
    }
  }, [selLineId, lines])

  async function handleSubmit() {
    if (!selLineId || !selSecId || !form.output || !form.mpActual) {
      setError(t('inputPage.errSelect'))
      return
    }
    setSaving(true); setError(''); setSaved(false)
    const res = await fetch('/api/actuals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lineId: selLineId, sectionId: selSecId,
        date: today(),
        hour: parseInt(form.hour),
        output: parseInt(form.output),
        mpActual: parseInt(form.mpActual),
        downtime: parseInt(form.downtime) || 0,
        dtReason: form.dtReason,
        defect: parseInt(form.defect) || 0,
      }),
    })
    if (res.ok) {
      setSaved(true)
      setForm(f => ({ ...f, output: '', mpActual: '', downtime: '0', dtReason: '', defect: '0' }))
      setTimeout(() => setSaved(false), 3000)
    } else {
      setError(t('inputPage.errSave'))
    }
    setSaving(false)
  }

  if (loading) return <div className="text-gray-400 text-sm p-8">{t('inputPage.loadingLines')}</div>

  const outputNum = parseInt(form.output) || 0
  const gap = tph > 0 && outputNum > 0 ? outputNum - tph : null
  const dateLocale = locale === 'id' ? 'id-ID' : locale

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-gray-900">{t('nav.inputActual')}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {new Date().toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Step 1 - Pilih lokasi */}
      <div className="card p-4 mb-3">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          {t('inputPage.step1')}
        </div>
        <div className="space-y-3">
          {/* Gedung */}
          <div>
            <label className="label">{t('user.building')}</label>
            <div className="flex flex-wrap gap-2">
              {buildings.map(b => (
                <button key={b} onClick={() => setSelBuilding(b)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                    selBuilding === b ? 'bg-teal text-white border-teal' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}>
                  {b === 'G' ? 'G (Stockfit)' : t('inputPage.buildingShort', { b })}
                </button>
              ))}
            </div>
          </div>

          {/* Line */}
          {selBuilding && (
            <div>
              <label className="label">{t('inputPage.line')}</label>
              {filteredLines.length === 0 ? (
                <p className="text-sm text-amber-600">{t('inputPage.noLinesWithModel', { building: selBuilding })}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {filteredLines.map(l => (
                    <button key={l.id} onClick={() => setSelLineId(l.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                        selLineId === l.id ? 'bg-teal text-white border-teal' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}>
                      {t('inputPage.lineN', { n: l.lineNo })}
                      {l.model && <span className="text-xs opacity-75 ml-1">({l.model.name})</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Section */}
          {selLineId && selLine?.sections && selLine.sections.length > 0 && (
            <div>
              <label className="label">{t('inputPage.section')}</label>
              <div className="flex flex-wrap gap-2">
                {selLine.sections.map(s => (
                  <button key={s.id} onClick={() => setSelSecId(s.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                      selSecId === s.id ? 'bg-teal text-white border-teal' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Selected info */}
      {selLine && selSec && (
        <div className="px-4 py-2 bg-teal-light border border-teal rounded-lg text-sm text-teal-dark mb-3 flex items-center justify-between">
          <span>
            <strong>{t('inputPage.selectedLine', { building: selLine.building, line: selLine.lineNo })}</strong> · {selSec.name}
          </span>
          <span className="text-xs">{t('inputPage.targetInfo', { tph, tt: selSec.taktTime })}</span>
        </div>
      )}

      {/* Step 2 - Input data */}
      {selLineId && selSecId && (
        <div className="card p-4 mb-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {t('inputPage.step2')}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label">{t('inputPage.hourLabel')}</label>
              <select className="input" value={form.hour} onChange={e => setForm(f => ({ ...f, hour: e.target.value }))}>
                {[...SHIFT_HOURS, ...OT_HOURS].map(h => <option key={h} value={h}>{h}:00 – {h+1}:00</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t('inputPage.outputLabel')}</label>
              <input type="number" min="0" className="input text-lg font-semibold" placeholder={t('inputPage.targetPlaceholder', { tph })}
                value={form.output} onChange={e => setForm(f => ({ ...f, output: e.target.value }))} />
              {gap !== null && (
                <p className={`text-xs mt-1 font-medium ${gap >= 0 ? 'text-teal' : 'text-red-600'}`}>
                  {gap >= 0 ? `+${gap} ${t('leader.outputTarget')}` : `${gap} ${t('leader.outputTarget')}`}
                </p>
              )}
            </div>
            <div>
              <label className="label">{t('inputPage.mpLabel')}</label>
              <input type="number" min="0" className="input" placeholder={t('inputPage.stdPlaceholder', { n: selSec?.stdMP ?? 0 })}
                value={form.mpActual} onChange={e => setForm(f => ({ ...f, mpActual: e.target.value }))} />
            </div>
            <div>
              <label className="label">{t('inputPage.defectLabel')}</label>
              <input type="number" min="0" className="input"
                value={form.defect} onChange={e => setForm(f => ({ ...f, defect: e.target.value }))} />
            </div>
            <div>
              <label className="label">{t('inputPage.downtimeLabel')}</label>
              <input type="number" min="0" className="input"
                value={form.downtime} onChange={e => setForm(f => ({ ...f, downtime: e.target.value }))} />
            </div>
            <div>
              <label className="label">{t('leader.downtimeReason')}</label>
              <select className="input" value={form.dtReason} onChange={e => setForm(f => ({ ...f, dtReason: e.target.value }))}>
                <option value="">{t('inputPage.selectPlaceholder')}</option>
                {DT_REASONS.map(r => <option key={r.value} value={r.value}>{t(r.key)}</option>)}
              </select>
            </div>
          </div>

          {error && (
            <div className="mb-3 px-3 py-2 bg-red-50 text-red-700 text-sm rounded-lg">⚠ {error}</div>
          )}
          {saved && (
            <div className="mb-3 px-3 py-2 bg-teal-light text-teal-dark text-sm rounded-lg font-medium">
              ✓ {t('inputPage.savedAt', { hour: form.hour })}
            </div>
          )}

          <button onClick={handleSubmit} disabled={saving}
            className="btn btn-primary w-full justify-center text-base py-3">
            {saving ? t('common.saving') : `✓ ${t('inputPage.saveBtn', { hour: form.hour })}`}
          </button>
        </div>
      )}

      {!selLineId && !loading && (
        <div className="card p-8 text-center text-gray-400 text-sm">
          {t('inputPage.emptyState')}
        </div>
      )}
    </div>
  )
}
