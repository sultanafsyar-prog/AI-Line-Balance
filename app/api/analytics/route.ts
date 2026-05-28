import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { today } from '@/lib/utils'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY belum diset. Hubungi IT Admin.' }, { status: 500 })
  }

  let body: { lineId: string; sectionName: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Request body tidak valid.' }, { status: 400 }) }

  const { lineId, sectionName } = body
  if (!lineId || !sectionName)
    return NextResponse.json({ error: 'lineId dan sectionName wajib diisi.' }, { status: 400 })

  let line: any
  try {
    line = await prisma.line.findUnique({
      where: { id: lineId },
      include: {
        assignments: {
          where: { active: true }, take: 1, orderBy: { assignedAt: 'desc' },
          include: { model: { include: { sections: { include: { operations: { orderBy: { seq: 'asc' } } } } } } }
        },
        actuals: {
          where: { date: today() },
          include: { section: true },
          orderBy: { hour: 'asc' }
        }
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: `DB error: ${e.message}` }, { status: 500 })
  }

  if (!line) return NextResponse.json({ error: 'Line tidak ditemukan.' }, { status: 404 })

  const assignment = line.assignments?.[0]
  if (!assignment)
    return NextResponse.json({ error: 'Line belum ada model yang di-assign.' }, { status: 400 })

  const model   = assignment.model
  const section = model.sections.find((s: any) => s.name === sectionName)
  if (!section)
    return NextResponse.json({ error: `Section "${sectionName}" tidak ditemukan.` }, { status: 404 })

  // ── Kalkulasi standar IE ──────────────────────────────────────
  const ops = section.operations ?? []
  const sectionActuals = line.actuals
    .filter((a: any) => a.section?.name === sectionName)
    .sort((a: any, b: any) => (a.hour ?? 0) - (b.hour ?? 0))

  const totOut = sectionActuals.reduce((s: number, a: any) => s + (a.output ?? 0), 0)
  const totDT  = sectionActuals.reduce((s: number, a: any) => s + (a.downtime ?? 0), 0)
  const totDef = sectionActuals.reduce((s: number, a: any) => s + (a.defect ?? 0), 0)
  const avgMP  = sectionActuals.length
    ? Math.round(sectionActuals.reduce((s: number, a: any) => s + (a.mpActual ?? 0), 0) / sectionActuals.length)
    : 0

  const targetPerHour  = section.taktTime > 0 ? Math.floor(3600 / section.taktTime) : 0
  const totalTargetOut = targetPerHour * sectionActuals.length
  const llerPct        = totalTargetOut > 0 ? Math.round((totOut / totalTargetOut) * 100) : 0
  const mpGap          = avgMP - section.stdMP
  const mpGapText      = mpGap >= 0
    ? `+${mpGap.toFixed(1)} (LEBIH dari standar)`
    : `${mpGap.toFixed(1)} (KURANG dari standar)`

  const theorMP = ops.length > 0
    ? Math.ceil(ops.reduce((s: number, o: any) => s + (o.gwt ?? 0), 0) / (section.taktTime || 1))
    : 0
  const lbr = ops.length > 0 && section.taktTime > 0
    ? Math.round((ops.reduce((s: number, o: any) => s + (o.gwt ?? 0), 0) / (ops.length * section.taktTime)) * 100)
    : 0
  const bottleneck    = ops.length > 0
    ? ops.reduce((max: any, o: any) => (o.gwt ?? 0) > (max.gwt ?? 0) ? o : max, ops[0])
    : null
  const bottleneckGwt = bottleneck?.gwt ?? 0

  const topOps = [...ops]
    .sort((a: any, b: any) => (b.gwt ?? 0) - (a.gwt ?? 0))
    .slice(0, 6)
    .map((o: any) => {
      const gwt  = o.gwt ?? 0
      const flag = gwt > section.taktTime ? ' <- MELEBIHI TAKT TIME' : ''
      return `  - ${o.name}: GWT ${gwt}s${flag}`
    })
    .join('\n')

  // ── Tren output per jam (data nyata lapangan) ─────────────────
  const outputTrend = sectionActuals.map((a: any) => {
    const h      = a.hour ?? 0
    const hEnd   = h + 1
    const out    = a.output ?? 0
    const mp     = a.mpActual ?? 0
    const dt     = a.downtime ?? 0
    const def    = a.defect ?? 0
    const reason = a.downtimeReason ? ` [alasan: ${a.downtimeReason}]` : ''
    const vs     = targetPerHour > 0 ? `, target ${targetPerHour}, gap ${out - targetPerHour}` : ''
    const dtInfo = dt > 0 ? ` | DT: ${dt}mnt${reason}` : ''
    const defInfo = def > 0 ? ` | Defect: ${def} pairs` : ''
    return `  Jam ${h}:00-${hEnd}:00 -> Output: ${out} pairs${vs} | MP hadir: ${mp}${dtInfo}${defInfo}`
  }).join('\n')

  // Tren naik/turun
  let trendDesc = 'belum cukup data (< 3 jam)'
  if (sectionActuals.length >= 3) {
    const first = sectionActuals[0]?.output ?? 0
    const last  = sectionActuals[sectionActuals.length - 1]?.output ?? 0
    const diff  = last - first
    if (diff > 5)       trendDesc = `NAIK +${diff} pairs (jam pertama vs terakhir) - kondisi membaik`
    else if (diff < -5) trendDesc = `TURUN ${diff} pairs (jam pertama vs terakhir) - kondisi memburuk`
    else                trendDesc = 'STABIL'
  }

  const worstHour = sectionActuals.length > 0
    ? sectionActuals.reduce((min: any, a: any) => (a.output ?? 0) < (min.output ?? 0) ? a : min, sectionActuals[0])
    : null
  const bestHour = sectionActuals.length > 0
    ? sectionActuals.reduce((max: any, a: any) => (a.output ?? 0) > (max.output ?? 0) ? a : max, sectionActuals[0])
    : null

  // ── Prompt dengan data lapangan lengkap ──────────────────────
  const prompt = `Kamu adalah ahli Industrial Engineering pabrik sepatu berpengalaman 15 tahun. Analisis kondisi NYATA di lapangan berdasarkan data aktual per jam, bukan hanya standar IE. Berikan rekomendasi yang bisa langsung dieksekusi supervisor hari ini.

DATA STANDAR IE (REFERENSI TEORITIS):
- Line       : Gedung ${line.building} Line ${line.lineNo}
- Model      : ${model.name} (${model.article}) | ${model.lineType === 'BIG' ? 'Big Line' : 'Mini Line'}
- Section    : ${sectionName}
- Takt Time  : ${section.taktTime}s -> target ${targetPerHour} pairs/jam
- Std MP     : ${section.stdMP} orang | Theor. MP: ${theorMP} orang | LBR: ${lbr}%
- Bottleneck standar IE: ${bottleneck ? `${bottleneck.name} (GWT ${bottleneckGwt}s vs TT ${section.taktTime}s)` : 'N/A'}

Top 6 operasi GWT tertinggi dari standar IE:
${topOps || '  (belum ada data standar)'}

PENTING: Bottleneck standar IE di atas adalah TEORITIS. Analisis data aktual di bawah untuk temukan masalah NYATA.

DATA AKTUAL LAPANGAN HARI INI (${sectionActuals.length} jam ter-input):
- Total output     : ${totOut} pairs dari target ${totalTargetOut} pairs
- LLER             : ${llerPct}% ${llerPct >= 90 ? '(BAIK)' : llerPct >= 75 ? '(PERLU PERHATIAN)' : '(KRITIS)'}
- Rata-rata MP     : ${avgMP} orang vs std ${section.stdMP} | Gap: ${mpGapText}
- Total downtime   : ${totDT} menit ${totDT > 30 ? '(TINGGI - investigasi penyebab)' : ''}
- Total defect     : ${totDef} pairs${totOut > 0 ? ` (${((totDef / totOut) * 100).toFixed(1)}% defect rate)` : ''}
- Tren output      : ${trendDesc}
${worstHour ? `- Jam output terendah: Jam ${worstHour.hour}:00 -> ${worstHour.output ?? 0} pairs` : ''}
${bestHour  ? `- Jam output tertinggi: Jam ${bestHour.hour}:00 -> ${bestHour.output ?? 0} pairs` : ''}

Detail per jam (laporan langsung dari operator):
${outputTrend || '  (belum ada data per jam)'}

Berikan analisis dalam format Bahasa Indonesia (gunakan markdown):

## Status Lini
(kondisi NYATA lini hari ini dalam 2-3 kalimat, berdasarkan angka aktual bukan asumsi)

## Analisis Masalah Utama
(dari data per jam di atas, identifikasi: apakah masalah dari MP kurang, downtime, defect, atau lainnya? Jam berapa masalah paling berat terjadi? Apakah bottleneck nyata sama dengan bottleneck standar IE atau berbeda?)

## Rekomendasi MP
(saran spesifik: tambah/kurangi/pindah berapa orang ke operasi mana, berdasarkan gap MP aktual)

## Target Realistis Sampai Akhir Shift
(estimasi output yang bisa dicapai berdasarkan tren saat ini)

## 3 Tindakan Prioritas Untuk Supervisor Sekarang
(urut dari paling urgent, berdasarkan data aktual bukan teori)`

  // ── Panggil Anthropic API ─────────────────────────────────────
  let aiResponse: Response
  try {
    aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages:   [{ role: 'user', content: prompt }],
      }),
    })
  } catch (e: any) {
    return NextResponse.json({ error: `Gagal konek ke Anthropic: ${e.message}` }, { status: 502 })
  }

  if (!aiResponse.ok) {
    let errBody = ''
    try { errBody = await aiResponse.text() } catch {}
    if (aiResponse.status === 401)
      return NextResponse.json({ error: 'API key Anthropic tidak valid. Cek ANTHROPIC_API_KEY di Vercel.' }, { status: 500 })
    if (aiResponse.status === 429)
      return NextResponse.json({ error: 'Rate limit Anthropic. Tunggu beberapa detik lalu coba lagi.' }, { status: 429 })
    return NextResponse.json({ error: `Anthropic error (${aiResponse.status}): ${errBody}` }, { status: 500 })
  }

  let data: any
  try { data = await aiResponse.json() }
  catch { return NextResponse.json({ error: 'Response Anthropic tidak bisa dibaca.' }, { status: 500 }) }

  const text = data.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n') ?? ''
  if (!text)
    return NextResponse.json({ error: 'AI tidak menghasilkan teks. Data line mungkin belum lengkap.' }, { status: 500 })

  return NextResponse.json({ analysis: text })
}
