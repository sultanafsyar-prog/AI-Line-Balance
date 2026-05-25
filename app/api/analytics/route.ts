import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { calcSectionMetrics, today } from '@/lib/utils'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { lineId, sectionName } = await req.json()

  // Ambil data line + model + section
  const line = await prisma.line.findUnique({
    where: { id: lineId },
    include: {
      assignments: {
        where: { active: true }, take: 1,
        include: { model: { include: {
          sections: { where: { name: sectionName }, include: { operations: { orderBy: { seq: 'asc' } } } }
        }}}
      },
      actuals: { where: { date: today() }, include: { section: true } },
    }
  })

  if (!line || !line.assignments[0]) return NextResponse.json({ error: 'Line or model not found' }, { status: 404 })

  const model = line.assignments[0].model
  const section = model.sections[0]
  if (!section) return NextResponse.json({ error: 'Section not found' }, { status: 404 })

  const tph = model.lineType === 'BIG' ? 180 : 100
  const { rows, theorMP, lbr, bottleneck } = calcSectionMetrics(section.operations, section.stdMP, section.taktTime)

  const sectionActuals = line.actuals.filter(a => a.section.name === sectionName)
  const totOut = sectionActuals.reduce((s, a) => s + a.output, 0)
  const totDT  = sectionActuals.reduce((s, a) => s + a.downtime, 0)
  const totDef = sectionActuals.reduce((s, a) => s + a.defect, 0)
  const avgMP  = sectionActuals.length ? Math.round(sectionActuals.reduce((s, a) => s + a.mpActual, 0) / sectionActuals.length) : 0

  const prompt = `Kamu ahli Industrial Engineering pabrik sepatu. Analisis dan beri rekomendasi praktis Bahasa Indonesia.

Line: Gedung ${line.building} Line ${line.lineNo} | Model: ${model.name} | ${model.lineType === 'BIG' ? 'Big Line' : 'Mini Line'} | Takt: ${section.taktTime}s
Section: ${sectionName} | Std MP: ${section.stdMP} | Theoretical MP: ${theorMP} | LBR: ${lbr}%
Bottleneck: ${bottleneck.name} (GWT: ${bottleneck.gwt}s vs TT: ${section.taktTime}s)
Aktual hari ini (${sectionActuals.length} jam): Output=${totOut} pairs | Avg MP=${avgMP} | DT=${totDT}mnt | Defect=${totDef}

Top operasi GWT tertinggi:
${rows.sort((a, b) => b.gwt - a.gwt).slice(0, 6).map(r => `- ${r.name}: ${r.gwt}s ${r.gwt > section.taktTime ? '[BOTTLENECK]' : ''}`).join('\n')}

Format respons:
1. **Status Lini**
2. **Analisis Bottleneck**
3. **Rekomendasi MP**
4. **Target Realistis**
5. **Prioritas Tindakan**`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 900, messages: [{ role: 'user', content: prompt }] }),
  })

  const data = await res.json()
  const text = data.content?.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n') ?? ''
  return NextResponse.json({ analysis: text })
}
