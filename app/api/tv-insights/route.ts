import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { today, getShift1Hours } from '@/lib/utils'
import { requireSession } from '@/lib/api-helpers'
import { z } from 'zod'

export const maxDuration = 60

// ═════════════════════════════════════════════════════════════
// TV INSIGHTS API
//
// Endpoint untuk AI mode di TV display. Generate insight terstruktur
// untuk semua line di gedung yang sudah ada actuals hari ini.
//
// Caching:
//   - In-memory cache per building+locale
//   - Hash dari jumlah actuals + jam terbaru → cache invalidates otomatis
//     saat ada input baru. Tidak perlu polling/webhook.
//   - Safety TTL 60 menit walaupun data sama (catch edge case)
//
// Locale: id (Bahasa Indonesia), en (English), zh-TW (Traditional Chinese)
// ═════════════════════════════════════════════════════════════

const DEFAULT_AI_MODEL = 'claude-haiku-4-5-20251001'
const CACHE_TTL_MS = 60 * 60 * 1000 // 60 minutes
const SAFETY_THRESHOLD_CRITICAL = 70
const SAFETY_THRESHOLD_WARNING  = 85

// ─── Zod schema untuk validasi output AI ──────────────────────
const InsightSchema = z.object({
  status: z.enum(['ok', 'warning', 'critical']),
  generatedAt: z.string(),
  locale: z.string(),
  building: z.string(),
  linesAnalyzed: z.number(),
  issues: z.array(z.object({
    line: z.string(),
    severity: z.enum(['high', 'medium']),
    title: z.string().max(80),
    detail: z.string().max(200),
  })).max(5),
  patterns: z.array(z.object({
    icon: z.string().max(4),
    title: z.string().max(60),
    detail: z.string().max(200),
  })).max(4),
  mpAnalysis: z.object({
    summary: z.string().max(200),
    items: z.array(z.object({
      line: z.string(),
      status: z.enum(['good', 'over', 'under']),
      detail: z.string().max(120),
    })).max(8),
  }),
  recommendations: z.array(z.object({
    priority: z.enum(['high', 'medium', 'low']),
    text: z.string().max(200),
  })).max(4),
})

type InsightOutput = z.infer<typeof InsightSchema>

// ─── In-memory cache ──────────────────────────────────────────
type CachedInsight = { dataHash: string; data: InsightOutput; generatedAt: number }
const cache = new Map<string, CachedInsight>()

// ─── Helpers ──────────────────────────────────────────────────
function getGWT(op: { va: number; nvan: number; nva: number; allowance: number }) {
  return (op.va + op.nvan + op.nva) * (1 + (op.allowance ?? 0.15))
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

// Locale-specific empty state message
function emptyStateMessage(locale: string, building: string): InsightOutput {
  const messages: Record<string, { status: string; summary: string }> = {
    id: { status: 'Belum ada data input hari ini', summary: 'Menunggu input pertama dari Team Leader.' },
    en: { status: 'No input data yet today',       summary: 'Waiting for first input from Team Leader.' },
    'zh-TW': { status: '今日尚無輸入資料',         summary: '等待組長輸入第一筆資料。' },
  }
  const m = messages[locale] ?? messages.id
  return {
    status: 'ok',
    generatedAt: new Date().toISOString(),
    locale,
    building,
    linesAnalyzed: 0,
    issues: [],
    patterns: [{ icon: '⏳', title: m.status, detail: m.summary }],
    mpAnalysis: { summary: m.summary, items: [] },
    recommendations: [],
  }
}

// ═════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  const auth = await requireSession()
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const building = (searchParams.get('building') ?? '').toUpperCase()
  const locale = searchParams.get('locale') ?? 'id'
  const forceRefresh = searchParams.get('refresh') === 'true'

  if (!building) {
    return NextResponse.json({ error: 'Parameter building diperlukan' }, { status: 400 })
  }

  // ─── 1. Fetch lines + actuals hari ini ────────────────────
  const todayStr = today()
  const lines = await prisma.line.findMany({
    where: { building, active: true },
    include: {
      assignments: {
        where: { active: true }, take: 1, orderBy: { assignedAt: 'desc' },
        include: {
          model: {
            include: {
              sections: {
                include: { operations: { select: { va: true, nvan: true, nva: true, allowance: true } } },
              },
            },
          },
        },
      },
      actuals: {
        where: { date: todayStr },
        include: { section: { select: { name: true, taktTime: true, stdMP: true } } },
        orderBy: { hour: 'asc' },
      },
      alerts: {
        where: {
          resolved: false,
          triggeredAt: { gte: new Date(todayStr + 'T00:00:00+07:00') },
        },
      },
      dailyTargets: { where: { date: todayStr }, take: 1 },
    },
    orderBy: { lineNo: 'asc' },
  })

  // ─── 2. Filter hanya line yang sudah ada actuals ──────────
  const linesWithData = lines.filter(l => l.actuals.length > 0)

  if (linesWithData.length === 0) {
    return NextResponse.json(emptyStateMessage(locale, building))
  }

  // ─── 3. Build cache key + dataHash ─────────────────────────
  // Hash berubah saat ada input baru (count + last hour) → cache invalidates
  const totalActuals = linesWithData.reduce((s, l) => s + l.actuals.length, 0)
  const latestHour = Math.max(...linesWithData.flatMap(l => l.actuals.map(a => a.hour)))
  const alertCount = linesWithData.reduce((s, l) => s + l.alerts.length, 0)
  const dataHash = `${totalActuals}:${latestHour}:${alertCount}`
  const cacheKey = `${building}:${locale}`

  const cached = cache.get(cacheKey)
  if (!forceRefresh && cached
      && cached.dataHash === dataHash
      && (Date.now() - cached.generatedAt) < CACHE_TTL_MS) {
    return NextResponse.json({ ...cached.data, fromCache: true })
  }

  // ─── 4. Prepare data untuk AI ──────────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY belum diset' },
      { status: 500 }
    )
  }

  const aiInput = linesWithData.map(line => {
    const model = line.assignments[0]?.model
    if (!model) return null

    // theoMP per section
    const sections = model.sections.map(sec => {
      const totalGWT = (sec.operations ?? []).reduce((s, op) => s + getGWT(op), 0)
      const theoMP = sec.taktTime > 0 ? totalGWT / sec.taktTime : 0
      return {
        name: sec.name,
        takt: sec.taktTime,
        stdMP: sec.stdMP,
        theoMP: parseFloat(theoMP.toFixed(1)),
        theoPPH: sec.taktTime > 0 ? Math.round(3600 / sec.taktTime) : 0,
      }
    })

    // Actuals grouped by section
    const sectionActuals: Record<string, any[]> = {}
    for (const a of line.actuals) {
      const sn = a.section?.name ?? 'unknown'
      if (!sectionActuals[sn]) sectionActuals[sn] = []
      sectionActuals[sn].push({
        hour: a.hour,
        output: a.output,
        mp: a.mpActual,
        downtime: a.downtime,
        defect: a.defect,
        dtReason: a.dtReason,
      })
    }

    // Compute LLER per section + line
    const sectionMetrics = Object.entries(sectionActuals).map(([secName, acts]) => {
      const sec = sections.find(s => s.name === secName)
      if (!sec) return null
      const totOut = acts.reduce((s, a) => s + a.output, 0)
      const avgOut = acts.length > 0 ? totOut / acts.length : 0
      const avgMP = acts.length > 0 ? acts.reduce((s, a) => s + a.mp, 0) / acts.length : 0
      const totDT = acts.reduce((s, a) => s + a.downtime, 0)
      const totDef = acts.reduce((s, a) => s + a.defect, 0)
      const lller = (avgOut > 0 && avgMP > 0 && sec.theoPPH > 0 && sec.theoMP > 0)
        ? Math.round((avgOut * avgMP) / (sec.theoPPH * sec.theoMP) * 100) : 0
      return {
        section: secName,
        std: { takt: sec.takt, theoMP: sec.theoMP, theoPPH: sec.theoPPH },
        actual: {
          avgOut: Math.round(avgOut),
          avgMP: parseFloat(avgMP.toFixed(1)),
          totOut, totDT, totDef,
          defectRate: totOut > 0 ? parseFloat((totDef / totOut * 100).toFixed(1)) : 0,
          hoursInput: acts.length,
        },
        lller,
      }
    }).filter(Boolean)

    // Daily target
    const dailyTarget = line.dailyTargets[0]
    const totLineOutput = line.actuals.reduce((s, a) => s + a.output, 0)
    const targetPct = dailyTarget && dailyTarget.targetPairs > 0
      ? Math.round((totLineOutput / dailyTarget.targetPairs) * 100) : null

    // Last input recency
    const latestHourThisLine = Math.max(...line.actuals.map(a => a.hour))
    const expectedHour = getShift1Hours().filter(h => h <= new Date().getHours()).pop() ?? latestHourThisLine
    const isStale = (expectedHour - latestHourThisLine) >= 2

    return {
      line: `L${line.lineNo}`,
      model: model.name,
      article: model.article,
      sections: sectionMetrics,
      dailyTarget: dailyTarget?.targetPairs ?? null,
      totalOutputToday: totLineOutput,
      dailyTargetPct: targetPct,
      latestInputHour: latestHourThisLine,
      isStale,
      alerts: line.alerts.map(a => ({ type: a.type, message: a.message })),
    }
  }).filter(Boolean)

  // ─── 5. 7-day historical LLER trend per line ──────────────
  const lineIds = linesWithData.map(l => l.id)
  const histActuals = await prisma.actual.findMany({
    where: {
      lineId: { in: lineIds },
      date: { gte: daysAgo(7), lt: todayStr },
    },
    include: {
      section: {
        select: {
          taktTime: true,
          operations: { select: { va: true, nvan: true, nva: true, allowance: true } },
        },
      },
      line: { select: { id: true, lineNo: true } },
    },
  })
  // Aggregate per line per day
  const histMap = new Map<string, { num: number; den: number }>() // key = `L{n}:{date}`
  for (const a of histActuals) {
    const theoMP = a.section.taktTime > 0
      ? (a.section.operations.reduce((s, op) => s + getGWT(op), 0) / a.section.taktTime) : 0
    const theoPPH = a.section.taktTime > 0 ? 3600 / a.section.taktTime : 0
    if (theoMP <= 0 || theoPPH <= 0 || a.mpActual <= 0 || a.output <= 0) continue
    const key = `L${a.line.lineNo}:${a.date}`
    const cur = histMap.get(key) ?? { num: 0, den: 0 }
    cur.num += a.output * a.mpActual
    cur.den += theoPPH * theoMP
    histMap.set(key, cur)
  }
  const trend7Day: Record<string, number> = {}
  for (const [key, v] of histMap) {
    trend7Day[key] = v.den > 0 ? Math.round(v.num / v.den * 100) : 0
  }

  // ─── 6. Call AI ────────────────────────────────────────────
  const localeName = locale === 'en' ? 'English' : locale === 'zh-TW' ? 'Traditional Chinese' : 'Bahasa Indonesia'

  const systemPrompt = `You are an Industrial Engineering analyst for a footwear manufacturing factory.
You analyze production line performance and provide structured insights for the factory floor TV display.

CRITICAL OUTPUT RULES:
1. Return ONLY valid JSON matching the exact schema below. No prose, no markdown fences.
2. Output in ${localeName} (locale code: ${locale}).
3. Be CONCISE: TV display is read from 5 meters distance. Each text under specified char limit.
4. Use REAL DATA from the input. Cite specific numbers (LLER %, MP gap, hours).
5. NEVER fabricate. If data insufficient for a category, return shorter array.
6. Status thresholds (LLER produktivitas gabungan):
   - critical: LLER < ${SAFETY_THRESHOLD_CRITICAL}% on any line → status='critical'
   - warning: LLER ${SAFETY_THRESHOLD_CRITICAL}-${SAFETY_THRESHOLD_WARNING}% → status='warning'
   - ok: all lines ≥${SAFETY_THRESHOLD_WARNING}% → status='ok'

LLER formula: (actualPPH × actualMP) / (theoPPH × theoMP) × 100%
- theoMP from yamazumi (totalGWT / takt)
- theoPPH = 3600 / takt

JSON SCHEMA:
{
  "status": "ok" | "warning" | "critical",
  "generatedAt": "ISO timestamp",
  "locale": "${locale}",
  "building": "G",
  "linesAnalyzed": number,
  "issues": [                                  // max 5; empty if no problems
    {
      "line": "L4",
      "severity": "high" | "medium",
      "title": "Brief issue (max 80 chars)",
      "detail": "Specific numbers + impact (max 200 chars)"
    }
  ],
  "patterns": [                                // max 4; observed patterns/trends
    {
      "icon": "📈" | "📉" | "⚠" | "✓" | "🔄" etc,
      "title": "Pattern name (max 60 chars)",
      "detail": "Evidence with numbers (max 200 chars)"
    }
  ],
  "mpAnalysis": {
    "summary": "Overall MP health one sentence (max 200 chars)",
    "items": [                                 // max 8; one per line if relevant
      {
        "line": "L4",
        "status": "good" | "over" | "under",
        "detail": "Specific MP vs theo (max 120 chars)"
      }
    ]
  },
  "recommendations": [                         // max 4; actionable
    {
      "priority": "high" | "medium" | "low",
      "text": "Concrete action (max 200 chars)"
    }
  ]
}

ANALYSIS GUIDELINES:
- Issues: ONLY include lines that have a real problem. Empty array if all healthy.
- Patterns: Cross-line observations (e.g., "All Buffing lines low — material delay?", "Output drop after 12:00 — break impact").
- MP Analysis: Per-line over/understaffing vs theo MP. Mention specific gap.
- Recommendations: Concrete supervisor actions, not generic advice. Reference specific line numbers.
- If a line shows isStale=true, mention that input is missing/late.
- For Building G (Stockfit area), each line runs ONE section only — analyze accordingly.`

  const userPrompt = `Building: ${building}
Current hour: ${new Date().getHours()}
Lines with input today: ${aiInput.length}

LINE DATA (today):
${JSON.stringify(aiInput, null, 2)}

7-DAY HISTORICAL LLER (per line per date):
${JSON.stringify(trend7Day, null, 2)}

Generate the JSON insight now.`

  let aiData: InsightOutput
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: DEFAULT_AI_MODEL,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error('Anthropic API error:', res.status, errText)
      return NextResponse.json(
        { error: 'AI service error', detail: res.status },
        { status: 502 }
      )
    }

    const json = await res.json()
    const rawText: string = json.content?.[0]?.text ?? ''

    // Strip potential code fences and parse JSON
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(cleaned)

    // Validate with Zod
    const validated = InsightSchema.safeParse({
      ...parsed,
      generatedAt: new Date().toISOString(),
      locale,
      building,
      linesAnalyzed: aiInput.length,
    })

    if (!validated.success) {
      console.error('AI output validation failed:', validated.error)
      return NextResponse.json(
        { error: 'AI output format invalid', detail: validated.error.flatten() },
        { status: 502 }
      )
    }
    aiData = validated.data
  } catch (err) {
    console.error('AI insight generation failed:', err)
    return NextResponse.json(
      { error: 'AI generation failed', detail: String(err) },
      { status: 502 }
    )
  }

  // ─── 7. Cache + return ─────────────────────────────────────
  cache.set(cacheKey, { dataHash, data: aiData, generatedAt: Date.now() })
  return NextResponse.json({ ...aiData, fromCache: false })
}