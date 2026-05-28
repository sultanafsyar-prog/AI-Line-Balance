'use client'

/**
 * YamazumiAktual
 *
 * Menampilkan cycle time AKTUAL per jam (dihitung dari output + downtime)
 * vs Takt Time — bukan standar IE.
 *
 * Formula:
 *   CT aktual (s) = (3600 - downtime_detik) / output_pairs
 *
 * Interpretasi:
 *   CT aktual < TT  → jam itu EFISIEN (output melebihi/sesuai target)
 *   CT aktual > TT  → jam itu BOTTLENECK NYATA (output di bawah target)
 *   CT aktual >> TT → ada masalah serius (downtime tinggi / output sangat rendah)
 */

interface Actual {
  hour:           number
  output:         number
  mpActual:       number
  downtime:       number
  downtimeReason?: string
  defect:         number
}

interface Props {
  actuals:   Actual[]
  taktTime:  number   // dalam detik
  stdMP:     number
  sectionName: string
}

// ── Warna berdasarkan rasio CT/TT ────────────────────────────
function barColor(ct: number, tt: number) {
  const ratio = ct / tt
  if (ratio <= 0.9)  return { fill: '#1D9E75', label: 'Efisien',    text: '#085041' }
  if (ratio <= 1.0)  return { fill: '#EF9F27', label: 'Mendekati TT', text: '#633806' }
  if (ratio <= 1.3)  return { fill: '#E24B4A', label: 'Bottleneck',  text: '#791F1F' }
  return               { fill: '#A32D2D', label: 'Kritis',     text: '#501313' }
}

// ── Format jam ───────────────────────────────────────────────
function fmtHour(h: number) {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(h)}:00`
}

export default function YamazumiAktual({ actuals, taktTime, stdMP, sectionName }: Props) {
  if (!actuals || actuals.length === 0) {
    return (
      <div style={{
        padding: '40px 20px', textAlign: 'center',
        color: '#888780', fontSize: '13px',
        border: '1px dashed #e0dfd7', borderRadius: '12px',
      }}>
        Belum ada data aktual untuk section {sectionName} hari ini.
        <br/>
        <span style={{ fontSize: '12px', color: '#b4b2a9' }}>
          Input data aktual terlebih dahulu untuk melihat Yamazumi aktual.
        </span>
      </div>
    )
  }

  // Hitung CT aktual per jam
  const jamData = actuals.map(a => {
    const dtDetik   = (a.downtime ?? 0) * 60
    const waktuEfektif = Math.max(3600 - dtDetik, 0)
    const output    = a.output ?? 0
    const ct = output > 0 ? Math.round(3600 / output) : null
    const targetOut = taktTime > 0 ? Math.floor(3600 / taktTime) : 0
    const gap       = output - targetOut
    const color     = ct !== null ? barColor(ct, taktTime) : null
    return { ...a, ct, waktuEfektif, targetOut, gap, color }
  })

  // Skala chart — max CT untuk tinggi bar
  const maxCT   = Math.max(...jamData.map(j => j.ct ?? 0), taktTime * 1.5)
  const chartH  = 200  // px tinggi area chart
  const barW    = Math.min(56, Math.floor(560 / jamData.length) - 8)
  const chartW  = jamData.length * (barW + 8) + 40

  // Rata-rata CT aktual
  const validCTs  = jamData.filter(j => j.ct !== null).map(j => j.ct as number)
  const avgCT     = validCTs.length > 0
    ? Math.round(validCTs.reduce((s, v) => s + v, 0) / validCTs.length)
    : null
  const avgStatus = avgCT !== null ? barColor(avgCT, taktTime) : null

  // Jam bottleneck
  const bottleneckJams = jamData.filter(j => j.ct !== null && j.ct > taktTime)
  const efisienJams    = jamData.filter(j => j.ct !== null && j.ct <= taktTime)

  return (
    <div>
      {/* ── Penjelasan singkat ── */}
      <div style={{
        padding: '10px 14px', background: '#E1F5EE',
        borderRadius: '8px', marginBottom: '16px',
        fontSize: '12px', color: '#085041', lineHeight: 1.6,
      }}>
        <strong>Yamazumi Aktual</strong> — menampilkan cycle time nyata per jam
        yang dihitung dari data input operator (<em>CT = waktu efektif ÷ output</em>).
        Garis merah = Takt Time ({taktTime}s). Bar di atas garis = jam bermasalah.
      </div>

      {/* ── Kartu ringkasan ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '20px' }}>
        {[
          {
            label: 'Avg CT aktual',
            value: avgCT !== null ? `${avgCT}s` : '—',
            sub:   avgStatus ? avgStatus.label : '',
            color: avgStatus?.text ?? '#3d3d3a',
            bg:    avgCT !== null && avgCT <= taktTime ? '#E1F5EE' : '#FCEBEB',
          },
          {
            label: 'Takt Time',
            value: `${taktTime}s`,
            sub:   `target ${Math.floor(3600 / taktTime)} pairs/jam`,
            color: '#185FA5',
            bg:    '#E6F1FB',
          },
          {
            label: 'Jam efisien',
            value: `${efisienJams.length} jam`,
            sub:   `CT ≤ TT`,
            color: '#085041',
            bg:    '#E1F5EE',
          },
          {
            label: 'Jam bottleneck',
            value: `${bottleneckJams.length} jam`,
            sub:   `CT > TT`,
            color: bottleneckJams.length > 0 ? '#A32D2D' : '#3d3d3a',
            bg:    bottleneckJams.length > 0 ? '#FCEBEB' : '#f5f5f3',
          },
        ].map((card, i) => (
          <div key={i} style={{
            padding: '10px 12px', background: card.bg,
            borderRadius: '8px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '20px', fontWeight: 600, color: card.color }}>{card.value}</div>
            <div style={{ fontSize: '11px', color: '#888780', marginTop: '2px' }}>{card.label}</div>
            {card.sub && <div style={{ fontSize: '10px', color: card.color, marginTop: '1px' }}>{card.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── Chart ── */}
      <div style={{ overflowX: 'auto', marginBottom: '20px' }}>
        <svg
          width={Math.max(chartW, 400)}
          height={chartH + 60}
          style={{ display: 'block' }}
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(pct => {
            const y = chartH - (pct * chartH)
            const val = Math.round(maxCT * pct)
            return (
              <g key={pct}>
                <line x1={30} y1={y} x2={chartW} y2={y}
                  stroke="#f0f0ef" strokeWidth={1} />
                <text x={24} y={y + 4} textAnchor="end"
                  fontSize={10} fill="#b4b2a9">{val}s</text>
              </g>
            )
          })}

          {/* Garis Takt Time */}
          {(() => {
            const ttY = chartH - (taktTime / maxCT) * chartH
            return (
              <>
                <line x1={30} y1={ttY} x2={chartW} y2={ttY}
                  stroke="#E24B4A" strokeWidth={1.5} strokeDasharray="5,4" />
                <text x={chartW - 2} y={ttY - 4}
                  textAnchor="end" fontSize={10} fill="#E24B4A" fontWeight={500}>
                  TT={taktTime}s
                </text>
              </>
            )
          })()}

          {/* Bar per jam */}
          {jamData.map((jam, i) => {
            const x     = 36 + i * (barW + 8)
            const ct    = jam.ct
            const color = jam.color

            if (ct === null) {
              // Tidak ada output jam ini
              return (
                <g key={i}>
                  <rect x={x} y={0} width={barW} height={chartH}
                    fill="#f5f5f3" rx={4} />
                  <text x={x + barW / 2} y={chartH / 2}
                    textAnchor="middle" fontSize={9} fill="#b4b2a9">
                    no data
                  </text>
                  <text x={x + barW / 2} y={chartH + 14}
                    textAnchor="middle" fontSize={9} fill="#888780">
                    {fmtHour(jam.hour)}
                  </text>
                </g>
              )
            }

            const barH  = Math.max((ct / maxCT) * chartH, 4)
            const barY  = chartH - barH
            const ttY   = chartH - (taktTime / maxCT) * chartH
            const above = ct > taktTime

            return (
              <g key={i}>
                {/* Bar bawah (sampai TT) */}
                <rect
                  x={x} y={Math.min(barY, ttY)}
                  width={barW}
                  height={Math.abs(barY - ttY)}
                  fill={color!.fill}
                  rx={above ? 0 : 4}
                  opacity={0.9}
                />
                {/* Bagian bar (foundation) */}
                {above && (
                  <rect
                    x={x} y={ttY}
                    width={barW}
                    height={chartH - ttY}
                    fill="#1D9E75"
                    opacity={0.4}
                  />
                )}
                {/* Label CT di atas bar */}
                <text
                  x={x + barW / 2} y={Math.min(barY, ttY) - 3}
                  textAnchor="middle" fontSize={9}
                  fill={color!.text} fontWeight={500}
                >
                  {ct}s
                </text>
                {/* Label jam */}
                <text
                  x={x + barW / 2} y={chartH + 14}
                  textAnchor="middle" fontSize={9} fill="#888780"
                >
                  {fmtHour(jam.hour)}
                </text>
                {/* Label output */}
                <text
                  x={x + barW / 2} y={chartH + 26}
                  textAnchor="middle" fontSize={9} fill="#b4b2a9"
                >
                  {jam.output}p
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {/* ── Tabel detail per jam ── */}
      <div style={{ fontSize: '13px' }}>
        <div style={{ fontWeight: 500, color: '#1a1a18', marginBottom: '8px' }}>
          Detail per jam
        </div>
        <div style={{ border: '1px solid #f0f0ef', borderRadius: '8px', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '80px 1fr 1fr 1fr 1fr 1fr 100px',
            background: '#f5f5f3', padding: '8px 12px',
            fontSize: '11px', fontWeight: 500, color: '#888780',
          }}>
            <span>Jam</span>
            <span>Output</span>
            <span>Target</span>
            <span>Gap</span>
            <span>DT (mnt)</span>
            <span>CT aktual</span>
            <span>Status</span>
          </div>

          {jamData.map((jam, i) => {
            const ct    = jam.ct
            const color = jam.color
            const isOdd = i % 2 === 0

            return (
              <div key={i} style={{
                display: 'grid',
                gridTemplateColumns: '80px 1fr 1fr 1fr 1fr 1fr 100px',
                padding: '8px 12px',
                background: isOdd ? '#fff' : '#fafaf9',
                borderTop: '1px solid #f0f0ef',
                fontSize: '12px', color: '#3d3d3a',
                alignItems: 'center',
              }}>
                <span style={{ fontWeight: 500 }}>
                  {fmtHour(jam.hour)}–{fmtHour(jam.hour + 1)}
                </span>
                <span style={{ fontWeight: 500 }}>{jam.output} pairs</span>
                <span style={{ color: '#888780' }}>{jam.targetOut} pairs</span>
                <span style={{ color: jam.gap >= 0 ? '#0F6E56' : '#A32D2D', fontWeight: 500 }}>
                  {jam.gap >= 0 ? `+${jam.gap}` : jam.gap}
                </span>
                <span style={{ color: (jam.downtime ?? 0) > 10 ? '#A32D2D' : '#3d3d3a' }}>
                  {jam.downtime ?? 0} mnt
                  {jam.downtimeReason ? ` (${jam.downtimeReason})` : ''}
                </span>
                <span style={{ fontWeight: 500, color: color?.text ?? '#3d3d3a' }}>
                  {ct !== null ? `${ct}s` : '—'}
                </span>
                <span>
                  {color ? (
                    <span style={{
                      background: ct !== null && ct <= taktTime ? '#E1F5EE'
                        : ct !== null && ct <= taktTime * 1.3 ? '#FCEBEB' : '#FCEBEB',
                      color: color.text,
                      padding: '2px 8px', borderRadius: '99px',
                      fontSize: '11px', fontWeight: 500,
                    }}>
                      {color.label}
                    </span>
                  ) : '—'}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Insight otomatis ── */}
      {bottleneckJams.length > 0 && (
        <div style={{
          marginTop: '16px', padding: '12px 14px',
          background: '#FCEBEB', borderRadius: '8px',
          borderLeft: '3px solid #E24B4A',
          fontSize: '12px', color: '#A32D2D', lineHeight: 1.6,
        }}>
          <strong>Insight otomatis:</strong> {bottleneckJams.length} dari {jamData.length} jam
          memiliki CT aktual di atas Takt Time ({taktTime}s) →{' '}
          {bottleneckJams.map(j => `jam ${fmtHour(j.hour)}`).join(', ')}.
          {bottleneckJams.some(j => (j.downtime ?? 0) > 10)
            ? ' Kemungkinan penyebab utama: downtime tinggi.'
            : ' Kemungkinan penyebab: output rendah atau MP kurang.'}
        </div>
      )}

      {bottleneckJams.length === 0 && validCTs.length > 0 && (
        <div style={{
          marginTop: '16px', padding: '12px 14px',
          background: '#E1F5EE', borderRadius: '8px',
          borderLeft: '3px solid #1D9E75',
          fontSize: '12px', color: '#085041',
        }}>
          ✓ Semua jam beroperasi di bawah Takt Time — lini berjalan efisien hari ini.
        </div>
      )}
    </div>
  )
}
