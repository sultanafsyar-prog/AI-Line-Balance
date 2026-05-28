import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { today } from '@/lib/utils'

// ── Penting: naikkan timeout Vercel ke 60 detik ──────────────────
// Free tier max 10s, Pro tier max 60s
// Kalau masih timeout di free tier → upgrade ke Pro atau kurangi max_tokens
export const maxDuration = 60

export async function POST(req: NextRequest) {
  // ── 1. Auth check ─────────────────────────────────────────────
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Cek API key tersedia ────────────────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY belum diset di environment variables. Hubungi IT Admin.' },
      { status: 500 }
    )
  }

  // ── 3. Ambil data dari request ─────────────────────────────────
  let body: { lineId: string; sectionName: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Request body tidak valid.' }, { status: 400 })
  }

  const { lineId, sectionName } = body
  if (!lineId || !sectionName) {
    return NextResponse.json({ error: 'lineId dan sectionName wajib diisi.' }, { status: 400 })
  }

  // ── 4. Ambil data line dari database ──────────────────────────
  let line: any
  try {
    line = await prisma.line.findUnique({
      where: { id: lineId },
      include: {
        assignments: {
          where: { active: true },
          take: 1,
          orderBy: { assignedAt: 'desc' },
          include: {
            model: {
              include: {
                sections: {
                  include: { operations: { orderBy: { seq: 'asc' } } }
                }
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
  } catch (dbErr: any) {
    return NextResponse.json(
      { error: `Gagal ambil data dari database: ${dbErr.message}` },
      { status: 500 }
    )
  }

  if (!line) {
    return NextResponse.json({ error: 'Line tidak ditemukan.' }, { status: 404 })
  }

  const assignment = line.assignments?.[0]
  if (!assignment) {
    return NextResponse.json(
      { error: 'Line ini belum ada model yang di-assign. Assign model dulu sebelum menjalankan analisis AI.' },
      { status: 400 }
    )
  }

  const model   = assignment.model
  const section = model.sections.find((s: any) => s.name === sectionName)

  if (!section) {
    return NextResponse.json(
      { error: `Section "${sectionName}" tidak ditemukan di model ${model.name}.` },
      { status: 404 }
    )
  }

  // ── 5. Hitung metrik ──────────────────────────────────────────
  const ops = section.operations ?? []
  const sectionActuals = line.actuals.filter((a: any) => a.section?.name === sectionName)

  const totOut = sectionActuals.reduce((s: number, a: any) => s + (a.output ?? 0), 0)
  const totDT  = sectionActuals.reduce((s: number, a: any) => s + (a.downtime ?? 0), 0)
  const totDef = sectionActuals.reduce((s: number, a: any) => s + (a.defect ?? 0), 0)
  const avgMP  = sectionActuals.length
    ? Math.round(sectionActuals.reduce((s: number, a: any) => s + (a.mpActual ?? 0), 0) / sectionActuals.length)
    : 0

  const theorMP    = ops.length > 0
    ? Math.ceil(ops.reduce((s: number, o: any) => s + (o.gwt ?? 0), 0) / (section.taktTime || 1))
    : 0
  const lbr        = ops.length > 0 && section.taktTime > 0
    ? Math.round((ops.reduce((s: number, o: any) => s + (o.gwt ?? 0), 0) / (ops.length * section.taktTime)) * 100)
    : 0
  const bottleneck = ops.length > 0
    ? ops.reduce((max: any, o: any) => (o.gwt ?? 0) > (max.gwt ?? 0) ? o : max, ops[0])
    : null

  // Top 6 operasi GWT tertinggi
  const topOps = [...ops]
    .sort((a: any, b: any) => (b.gwt ?? 0) - (a.gwt ?? 0))
    .slice(0, 6)
    .map((o: any) => `- ${o.name}: ${o.gwt}s${(o.gwt ?? 0) > section.taktTime ? ' [BOTTLENECK]' : ''}`)
    .join('\n')

  // ── 6. Buat prompt ────────────────────────────────────────────
  const prompt = `Kamu adalah ahli Industrial Engineering pabrik sepatu berpengalaman 15 tahun. Berikan analisis singkat dan rekomendasi praktis dalam Bahasa Indonesia.

DATA LINE:
- Line: Gedung ${line.building} Line ${line.lineNo}
- Model: ${model.name} (${model.article})
- Tipe: ${model.lineType === 'BIG' ? 'Big Line' : 'Mini Line'}
- Section: ${sectionName}
- Takt Time: ${section.taktTime}s
- Std MP: ${section.stdMP} orang
- Theoretical MP: ${theorMP} orang
- LBR: ${lbr}%
- Bottleneck: ${bottleneck ? `${bottleneck.name} (${bottleneck.gwt}s)` : 'N/A'}

DATA AKTUAL HARI INI (${sectionActuals.length} jam input):
- Total output: ${totOut} pairs
- Rata-rata MP hadir: ${avgMP} orang
- Total downtime: ${totDT} menit
- Total defect: ${totDef} pairs

TOP OPERASI GWT TERTINGGI:
${topOps || '(belum ada data operasi)'}

Berikan analisis dalam format berikut (gunakan markdown):
## Status Lini
(kondisi lini saat ini dalam 1-2 kalimat)

## Analisis Bottleneck
(operasi mana yang jadi masalah utama dan kenapa)

## Rekomendasi MP
(saran redistribusi manpower yang spesifik dan actionable)

## Target Realistis
(berapa output yang bisa dicapai dengan kondisi saat ini)

## Prioritas Tindakan
(3 hal yang harus dilakukan supervisor sekarang, urutan prioritas)`

  // ── 7. Panggil Anthropic API ──────────────────────────────────
  let aiResponse: Response
  try {
    aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001', // Haiku: lebih cepat, cocok untuk free tier
        max_tokens: 800,
        messages:   [{ role: 'user', content: prompt }],
      }),
    })
  } catch (fetchErr: any) {
    return NextResponse.json(
      { error: `Gagal menghubungi Anthropic API: ${fetchErr.message}. Cek koneksi internet server.` },
      { status: 502 }
    )
  }

  // ── 8. Parse response ─────────────────────────────────────────
  if (!aiResponse.ok) {
    let errBody = ''
    try { errBody = await aiResponse.text() } catch {}

    // Error spesifik dari Anthropic
    if (aiResponse.status === 401) {
      return NextResponse.json(
        { error: 'API key Anthropic tidak valid. Cek ANTHROPIC_API_KEY di Vercel environment variables.' },
        { status: 500 }
      )
    }
    if (aiResponse.status === 429) {
      return NextResponse.json(
        { error: 'Rate limit Anthropic tercapai. Tunggu beberapa detik lalu coba lagi.' },
        { status: 429 }
      )
    }

    return NextResponse.json(
      { error: `Anthropic API error (${aiResponse.status}): ${errBody}` },
      { status: 500 }
    )
  }

  let data: any
  try {
    data = await aiResponse.json()
  } catch {
    return NextResponse.json(
      { error: 'Response dari Anthropic tidak bisa dibaca. Coba lagi.' },
      { status: 500 }
    )
  }

  const text = data.content
    ?.filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n') ?? ''

  if (!text) {
    return NextResponse.json(
      { error: 'AI tidak menghasilkan teks. Kemungkinan data line belum lengkap.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ analysis: text })
}
