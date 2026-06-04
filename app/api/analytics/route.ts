import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { today } from '@/lib/utils'
import { requireSession, parseBody, hasLineAccess } from '@/lib/api-helpers'
import { AnalyticsRequestSchema } from '@/lib/validation'

export const maxDuration = 60

const DEFAULT_AI_MODEL = 'claude-haiku-4-5-20251001'

export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (auth instanceof NextResponse) return auth

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY belum diset. Hubungi IT Admin.' },
      { status: 500 }
    )
  }

  const parsed = await parseBody(req, AnalyticsRequestSchema)
  if (parsed instanceof NextResponse) return parsed
  const { lineId, sectionName } = parsed

  if (!(await hasLineAccess(auth, lineId))) {
    return NextResponse.json({ error: 'Anda tidak punya akses ke line ini' }, { status: 403 })
  }

  const line = await prisma.line.findUnique({
    where: { id: lineId },
    include: {
      assignments: {
        where: { active: true }, take: 1, orderBy: { assignedAt: 'desc' },
        include: {
          model: {
            include: {
              sections: { include: { operations: { orderBy: { seq: 'asc' } } } }
            }
          }
        }
      },
      actuals: {
        where: { date: today() },
        include: { section: true },
        orderBy: { hour: 'asc' }
      }
    }
  })

  if (!line) return NextResponse.json({ error: 'Line tidak ditemukan.' }, { status: 404 })

  const assignment = line.assignments[0]
  if (!assignment) {
    return NextResponse.json(
      { error: 'Line belum ada model yang di-assign.' },
      { status: 400 }
    )
  }

  const model = assignment.model
  const section = model.sections.find(s => s.name === sectionName)
  if (!section) {
    return NextResponse.json(
      { error: `Section "${sectionName}" tidak ditemukan.` },
      { status: 404 }
    )
  }

  // ── Kalkulasi standar IE ───────────────────────────────────
  const ops = section.operations
  const sectionActuals = line.actuals
    .filter(a => a.section.name === sectionName)
    .sort((a, b) => a.hour - b.hour)

  const totOut = sectionActuals.reduce((s, a) => s + a.output, 0)
  const totDT  = sectionActuals.reduce((s, a) => s + a.downtime, 0)
  const totDef = sectionActuals.reduce((s, a) => s + a.defect, 0)
  const avgMP  = sectionActuals.length
    ? Math.round(sectionActuals.reduce((s, a) => s + a.mpActual, 0) / sectionActuals.length)
    : 0

  const targetPerHour  = section.taktTime > 0 ? Math.floor(3600 / section.taktTime) : 0
  const totalTargetOut = targetPerHour * sectionActuals.length
  // LLER = Theoretical MP / Actual MP × 100% (formula IE)
  // Output Achievement terpisah dari LLER
  const outputAchieve  = totalTargetOut > 0 ? Math.round((totOut / totalTargetOut) * 100) : 0
  const mpGap          = avgMP - section.stdMP
  const mpGapText      = mpGap >= 0
    ? `+${mpGap.toFixed(1)} (LEBIH dari standar)`
    : `${mpGap.toFixed(1)} (KURANG dari standar)`

  // GWT helper
  const gwt = (o: typeof ops[number]) =>
    (o.va + o.nvan + o.nva) * (1 + o.allowance)

  const opsWithGwt = ops.map(o => ({ ...o, gwt: gwt(o) }))
  const sumGwt = opsWithGwt.reduce((s, o) => s + o.gwt, 0)

  const theorMP = ops.length > 0 && section.taktTime > 0
    ? parseFloat((sumGwt / section.taktTime).toFixed(2))
    : 0
  // LLER = Theoretical MP / Actual MP × 100%
  const llerPct = avgMP > 0 && theorMP > 0 ? Math.round((theorMP / avgMP) * 100) : 0
  const lbr = ops.length > 0 && section.taktTime > 0
    ? Math.round((sumGwt / (ops.length * section.taktTime)) * 100)
    : 0

  const bottleneck = opsWithGwt.length > 0
    ? opsWithGwt.reduce((max, o) => o.gwt > max.gwt ? o : max, opsWithGwt[0])
    : null
  const bottleneckGwt = bottleneck?.gwt ?? 0

  const topOps = [...opsWithGwt]
    .sort((a, b) => b.gwt - a.gwt)
    .slice(0, 6)
    .map(o => {
      const mpNeeded = Math.ceil(o.gwt / section.taktTime)
      const effCT = (o.gwt / mpNeeded).toFixed(2)
      const multiMP = mpNeeded > 1 ? ` (butuh ${mpNeeded} MP, Eff CT ${effCT}s)` : ''
      return `  - ${o.name}: GWT ${o.gwt.toFixed(2)}s${multiMP}`
    })
    .join('\n')

  const outputTrend = sectionActuals.map(a => {
    const hEnd   = a.hour + 1
    const reason = a.dtReason ? ` [alasan: ${a.dtReason}]` : ''
    const vs     = targetPerHour > 0 ? `, target ${targetPerHour}, gap ${a.output - targetPerHour}` : ''
    const dtInfo = a.downtime > 0 ? ` | DT: ${a.downtime}mnt${reason}` : ''
    const defInfo = a.defect > 0 ? ` | Defect: ${a.defect} pairs` : ''
    return `  Jam ${a.hour}:00-${hEnd}:00 -> Output: ${a.output} pairs${vs} | MP hadir: ${a.mpActual}${dtInfo}${defInfo}`
  }).join('\n')

  let trendDesc = 'belum cukup data (< 3 jam)'
  if (sectionActuals.length >= 3) {
    const first = sectionActuals[0].output
    const last  = sectionActuals[sectionActuals.length - 1].output
    const diff  = last - first
    if (diff > 5)       trendDesc = `NAIK +${diff} pairs (jam pertama vs terakhir) - kondisi membaik`
    else if (diff < -5) trendDesc = `TURUN ${diff} pairs (jam pertama vs terakhir) - kondisi memburuk`
    else                trendDesc = 'STABIL'
  }

  const worstHour = sectionActuals.length > 0
    ? sectionActuals.reduce((min, a) => a.output < min.output ? a : min, sectionActuals[0])
    : null
  const bestHour = sectionActuals.length > 0
    ? sectionActuals.reduce((max, a) => a.output > max.output ? a : max, sectionActuals[0])
    : null

  const prompt = `Kamu adalah ahli Industrial Engineering pabrik sepatu berpengalaman 15 tahun. Analisis kondisi NYATA di lapangan berdasarkan data aktual per jam, bukan hanya standar IE. Berikan rekomendasi yang bisa langsung dieksekusi supervisor hari ini.

DATA STANDAR IE (REFERENSI TEORITIS):
- Line       : Gedung ${line.building} Line ${line.lineNo}
- Model      : ${model.name} (${model.article}) | ${model.lineType === 'BIG' ? 'Big Line' : 'Mini Line'}
- Section    : ${sectionName}
- Takt Time  : ${section.taktTime}s -> target ${targetPerHour} pairs/jam
- Std MP     : ${section.stdMP} orang | Theor. MP: ${theorMP} orang | LBR: ${lbr}%
- Operasi GWT tertinggi: ${bottleneck ? `${bottleneck.name} (GWT ${bottleneckGwt.toFixed(2)}s, butuh ${Math.ceil(bottleneckGwt / section.taktTime)} MP, Eff CT ${(bottleneckGwt / Math.ceil(bottleneckGwt / section.taktTime)).toFixed(2)}s)` : 'N/A'}

Top 6 operasi GWT tertinggi (CATATAN: GWT > Takt Time BUKAN berarti bottleneck — IE sudah memperhitungkan multi-MP untuk operasi tersebut):
${topOps || '  (belum ada data standar)'}

PENTING: Data standar IE di atas sudah DI-BALANCE oleh tim IE. Operasi dengan GWT tinggi sudah dialokasikan multi-MP.
Bottleneck NYATA hanya terjadi saat kondisi AKTUAL menyimpang dari standar (misal: MP kurang, mesin trouble, material telat).
Analisis data aktual di bawah untuk temukan masalah NYATA.

DATA AKTUAL LAPANGAN HARI INI (${sectionActuals.length} jam ter-input):
- Total output     : ${totOut} pairs dari target ${totalTargetOut} pairs
- LLER (labor eff) : ${llerPct}% (TheoMP ${theorMP} / ActMP ${avgMP}) ${llerPct >= 90 ? '(BAIK)' : llerPct >= 75 ? '(PERLU PERHATIAN)' : '(KRITIS)'}
- Rata-rata MP     : ${avgMP} orang vs std ${section.stdMP} | Gap: ${mpGapText}
- Total downtime   : ${totDT} menit ${totDT > 30 ? '(TINGGI - investigasi penyebab)' : ''}
- Total defect     : ${totDef} pairs${totOut > 0 ? ` (${((totDef / totOut) * 100).toFixed(1)}% defect rate)` : ''}
- Tren output      : ${trendDesc}
${worstHour ? `- Jam output terendah: Jam ${worstHour.hour}:00 -> ${worstHour.output} pairs` : ''}
${bestHour  ? `- Jam output tertinggi: Jam ${bestHour.hour}:00 -> ${bestHour.output} pairs` : ''}

Detail per jam (laporan langsung dari operator):
${outputTrend || '  (belum ada data per jam)'}

Berikan analisis dalam format Bahasa Indonesia (gunakan markdown):

## Status Lini
(kondisi NYATA lini hari ini dalam 2-3 kalimat, berdasarkan angka aktual bukan asumsi)

## Analisis Masalah Utama
(dari data per jam di atas, identifikasi: apakah masalah dari MP kurang dari standar, downtime, defect, atau lainnya? Jam berapa masalah paling berat terjadi? Operasi mana yang menjadi bottleneck NYATA berdasarkan data aktual — bukan dari standar IE?)

## Rekomendasi MP
(saran spesifik: tambah/kurangi/pindah berapa orang ke operasi mana, berdasarkan gap MP aktual)

## Target Realistis Sampai Akhir Shift
(estimasi output yang bisa dicapai berdasarkan tren saat ini)

## 3 Tindakan Prioritas Untuk Supervisor Sekarang
(urut dari paling urgent, berdasarkan data aktual bukan teori)`

  let aiResponse: Response
  try {
    aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      process.env.ANTHROPIC_MODEL ?? DEFAULT_AI_MODEL,
        max_tokens: 1000,
        messages:   [{ role: 'user', content: prompt }],
      }),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ error: `Gagal konek ke Anthropic: ${msg}` }, { status: 502 })
  }

  if (!aiResponse.ok) {
    let errBody = ''
    try { errBody = await aiResponse.text() } catch {}
    if (aiResponse.status === 401)
      return NextResponse.json({ error: 'API key Anthropic tidak valid.' }, { status: 500 })
    if (aiResponse.status === 429)
      return NextResponse.json({ error: 'Rate limit Anthropic. Tunggu beberapa detik lalu coba lagi.' }, { status: 429 })
    return NextResponse.json({ error: `Anthropic error (${aiResponse.status}): ${errBody}` }, { status: 500 })
  }

  let data: { content?: Array<{ type: string; text?: string }> }
  try {
    data = await aiResponse.json()
  } catch {
    return NextResponse.json({ error: 'Response Anthropic tidak bisa dibaca.' }, { status: 500 })
  }

  const text = data.content
    ?.filter(b => b.type === 'text')
    .map(b => b.text ?? '')
    .join('\n') ?? ''

  if (!text) {
    return NextResponse.json(
      { error: 'AI tidak menghasilkan teks. Data line mungkin belum lengkap.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ analysis: text })
}
