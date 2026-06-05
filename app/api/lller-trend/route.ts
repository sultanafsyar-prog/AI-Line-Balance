import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { today } from '@/lib/utils'
import { requireRole } from '@/lib/api-helpers'

// ─── LLER TREND ENDPOINT ──────────────────────────────────────
// Return:
//   - hourly: tren LLER per jam HARI INI (semua line di gedung)
//   - daily : tren LLER per hari, 14 hari terakhir (semua line di gedung)
//
// LLER produktivitas gabungan: (actualPPH × actualMP) / (theoPPH × theoMP) × 100
// Aggregasi level building: jumlahkan numerator dan denominator
// dari semua section x line, lalu hitung LLER sekali.
//
// Query param: ?building=G (opsional; default semua sesuai akses user)

type HourPoint = { hour: number; lller: number; output: number; mpAvg: number; lineCount: number }
type DayPoint  = { date: string; lller: number; output: number; mpAvg: number; activeLines: number }

function getGWT(op: { va: number; nvan: number; nva: number; allowance: number }) {
  return (op.va + op.nvan + op.nva) * (1 + (op.allowance ?? 0.15))
}

function daysAgo(n: number): string {
  // Asia/Jakarta date YYYY-MM-DD, n hari sebelum hari ini
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(['MANAGEMENT', 'IE_ADMIN', 'IE_OPERATOR', 'IT_ADMIN'])
  if (auth instanceof NextResponse) return auth
  const session = auth

  const userBuilding = session.user.building
  const { searchParams } = new URL(req.url)
  const filterBuilding = searchParams.get('building')
  const buildingFilter = userBuilding ?? (filterBuilding && filterBuilding !== 'ALL' ? filterBuilding : null)

  const todayStr = today()
  const startDate = daysAgo(13) // 14 hari termasuk hari ini

  // ── 1. Fetch actuals 14 hari ke belakang dengan section + ops ──
  const actuals = await prisma.actual.findMany({
    where: {
      date: { gte: startDate, lte: todayStr },
      ...(buildingFilter ? { line: { building: buildingFilter } } : {}),
    },
    include: {
      section: {
        select: {
          name: true, taktTime: true,
          operations: { select: { va: true, nvan: true, nva: true, allowance: true } },
        },
      },
      line: { select: { id: true, building: true, lineNo: true } },
    },
  })

  // ── Pre-compute theoMP per section (cache pakai sectionId) ──
  // Section yang sama selalu punya operations + takt sama
  const theoMPCache = new Map<string, number>()
  for (const a of actuals) {
    if (theoMPCache.has(a.sectionId)) continue
    const sec = a.section
    if (!sec.operations || sec.taktTime <= 0) { theoMPCache.set(a.sectionId, 0); continue }
    const totalGWT = sec.operations.reduce((s, op) => s + getGWT(op), 0)
    theoMPCache.set(a.sectionId, totalGWT / sec.taktTime)
  }

  // ── 2. AGGREGATE HOURLY (hari ini) ─────────────────────────
  const todayActs = actuals.filter(a => a.date === todayStr)
  // group by hour → bucket of (actPPH × actMP) and (theoPPH × theoMP)
  const hourBuckets = new Map<number, {
    num: number; den: number;
    outputSum: number; mpSum: number; mpCount: number;
    lineSet: Set<string>;
  }>()
  for (const a of todayActs) {
    const theoMP = theoMPCache.get(a.sectionId) ?? 0
    const theoPPH = a.section.taktTime > 0 ? 3600 / a.section.taktTime : 0
    if (theoMP <= 0 || theoPPH <= 0 || a.mpActual <= 0 || a.output <= 0) continue
    const num = a.output * a.mpActual
    const den = theoPPH * theoMP
    const b = hourBuckets.get(a.hour) ?? {
      num: 0, den: 0, outputSum: 0, mpSum: 0, mpCount: 0, lineSet: new Set<string>(),
    }
    b.num += num
    b.den += den
    b.outputSum += a.output
    b.mpSum += a.mpActual
    b.mpCount += 1
    b.lineSet.add(a.line.id)
    hourBuckets.set(a.hour, b)
  }
  const hourly: HourPoint[] = Array.from(hourBuckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([hour, b]) => ({
      hour,
      lller: b.den > 0 ? Math.round((b.num / b.den) * 100) : 0,
      output: b.outputSum,
      mpAvg: b.mpCount > 0 ? Math.round((b.mpSum / b.mpCount) * 10) / 10 : 0,
      lineCount: b.lineSet.size,
    }))

  // ── 3. AGGREGATE DAILY (14 hari) ───────────────────────────
  const dayBuckets = new Map<string, {
    num: number; den: number;
    outputSum: number; mpSum: number; mpCount: number;
    lineSet: Set<string>;
  }>()
  for (const a of actuals) {
    const theoMP = theoMPCache.get(a.sectionId) ?? 0
    const theoPPH = a.section.taktTime > 0 ? 3600 / a.section.taktTime : 0
    if (theoMP <= 0 || theoPPH <= 0 || a.mpActual <= 0 || a.output <= 0) continue
    const num = a.output * a.mpActual
    const den = theoPPH * theoMP
    const b = dayBuckets.get(a.date) ?? {
      num: 0, den: 0, outputSum: 0, mpSum: 0, mpCount: 0, lineSet: new Set<string>(),
    }
    b.num += num
    b.den += den
    b.outputSum += a.output
    b.mpSum += a.mpActual
    b.mpCount += 1
    b.lineSet.add(a.line.id)
    dayBuckets.set(a.date, b)
  }
  // Fill gaps: tampilkan semua 14 hari (yang tidak ada data = 0)
  const daily: DayPoint[] = []
  for (let i = 13; i >= 0; i--) {
    const dStr = daysAgo(i)
    const b = dayBuckets.get(dStr)
    if (b) {
      daily.push({
        date: dStr,
        lller: b.den > 0 ? Math.round((b.num / b.den) * 100) : 0,
        output: b.outputSum,
        mpAvg: b.mpCount > 0 ? Math.round((b.mpSum / b.mpCount) * 10) / 10 : 0,
        activeLines: b.lineSet.size,
      })
    } else {
      daily.push({ date: dStr, lller: 0, output: 0, mpAvg: 0, activeLines: 0 })
    }
  }

  return NextResponse.json({ hourly, daily })
}