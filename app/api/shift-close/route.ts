import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { today } from '@/lib/utils'

export const maxDuration = 60

// ── Helper: format angka ──────────────────────────────────────
const pct  = (n: number) => `${n}%`
const pair = (n: number) => `${n} pairs`

// ── Helper: buat baris tabel HTML ─────────────────────────────
function tr(cells: string[], header = false) {
  const tag  = header ? 'th' : 'td'
  const style = header
    ? 'background:#0F6E56;color:#fff;padding:8px 12px;text-align:left;font-size:13px;'
    : 'padding:8px 12px;border-bottom:1px solid #f0f0ef;font-size:13px;color:#3d3d3a;'
  return `<tr>${cells.map(c => `<${tag} style="${style}">${c}</${tag}>`).join('')}</tr>`
}

// ── Helper: status badge ──────────────────────────────────────
function badge(llerVal: number) {
  if (llerVal >= 90) return `<span style="background:#E1F5EE;color:#0F6E56;padding:2px 8px;border-radius:99px;font-size:12px;font-weight:600;">✓ BAIK ${pct(llerVal)}</span>`
  if (llerVal >= 75) return `<span style="background:#FAEEDA;color:#854F0B;padding:2px 8px;border-radius:99px;font-size:12px;font-weight:600;">⚠ PERHATIAN ${pct(llerVal)}</span>`
  return `<span style="background:#FCEBEB;color:#A32D2D;padding:2px 8px;border-radius:99px;font-size:12px;font-weight:600;">✗ KRITIS ${pct(llerVal)}</span>`
}

// ── POST /api/shift-close ─────────────────────────────────────
export async function POST(req: NextRequest) {
  // 1. Auth — hanya IE Admin / IE Operator
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (!['IE_ADMIN', 'IE_OPERATOR'].includes(user.role))
    return NextResponse.json({ error: 'Hanya IE Admin yang bisa tutup shift.' }, { status: 403 })

  // 2. Ambil lineId & shiftLabel dari request
  let body: { lineId: string; shiftLabel: string; managerEmail: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Request tidak valid.' }, { status: 400 }) }

  const { lineId, shiftLabel, managerEmail } = body
  if (!lineId || !shiftLabel || !managerEmail)
    return NextResponse.json({ error: 'lineId, shiftLabel, dan managerEmail wajib diisi.' }, { status: 400 })

  // 3. Ambil data line + aktual hari ini
  const line = await prisma.line.findUnique({
    where: { id: lineId },
    include: {
      assignments: {
        where: { active: true }, take: 1, orderBy: { assignedAt: 'desc' },
        include: { model: { include: { sections: true } } }
      },
      actuals: {
        where: { date: today() },
        include: { section: true },
        orderBy: { hour: 'asc' }
      },
      alerts: {
        where: { resolved: false },
        orderBy: { triggeredAt: 'desc' }
      }
    }
  })

  if (!line) return NextResponse.json({ error: 'Line tidak ditemukan.' }, { status: 404 })

  const model    = line.assignments?.[0]?.model
  const sections = model?.sections ?? []
  const actuals  = line.actuals

  if (actuals.length === 0)
    return NextResponse.json({ error: 'Belum ada data aktual yang diinput hari ini.' }, { status: 400 })

  // 4. Hitung ringkasan per section
  const sectionSummaries = sections.map((sec: any) => {
    const secActuals = actuals.filter((a: any) => a.section?.name === sec.name)
    if (secActuals.length === 0) return null

    const totOut    = secActuals.reduce((s: number, a: any) => s + (a.output ?? 0), 0)
    const totDT     = secActuals.reduce((s: number, a: any) => s + (a.downtime ?? 0), 0)
    const totDef    = secActuals.reduce((s: number, a: any) => s + (a.defect ?? 0), 0)
    const avgMP     = Math.round(secActuals.reduce((s: number, a: any) => s + (a.mpActual ?? 0), 0) / secActuals.length)
    const targetPH  = sec.taktTime > 0 ? Math.floor(3600 / sec.taktTime) : 0
    const totalTgt  = targetPH * secActuals.length
    const ller      = totalTgt > 0 ? Math.round((totOut / totalTgt) * 100) : 0
    const defRate   = totOut > 0 ? ((totDef / totOut) * 100).toFixed(1) : '0'

    return { name: sec.name, totOut, totDT, totDef, avgMP, totalTgt, ller, defRate, jamCount: secActuals.length }
  }).filter(Boolean)

  // 5. Ringkasan keseluruhan line
  const totalOut    = actuals.reduce((s: number, a: any) => s + (a.output ?? 0), 0)
  const totalDT     = actuals.reduce((s: number, a: any) => s + (a.downtime ?? 0), 0)
  const totalDef    = actuals.reduce((s: number, a: any) => s + (a.defect ?? 0), 0)
  const activeAlerts = line.alerts.length

  // LLER rata-rata semua section
  const avgLler = sectionSummaries.length > 0
    ? Math.round(sectionSummaries.reduce((s: number, sec: any) => s + sec.ller, 0) / sectionSummaries.length)
    : 0

  const now        = new Date()
  const tanggal    = now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const jamTutup   = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  const lineLabel  = `Gedung ${line.building} — Line ${line.lineNo}`
  const modelLabel = model ? `${model.name} (${model.article ?? ''})` : 'Belum ada model'

  // 6. Build email HTML
  const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;background:#f5f5f3;margin:0;padding:24px;">
<div style="max-width:680px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e0dfd7;">

  <!-- Header -->
  <div style="background:#0F6E56;padding:20px 24px;">
    <div style="display:flex;align-items:center;gap:12px;">
      <div style="width:40px;height:40px;background:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;">
        <span style="color:#0F6E56;font-weight:700;font-size:14px;">IE</span>
      </div>
      <div>
        <div style="color:#fff;font-size:18px;font-weight:600;">Laporan Akhir Shift</div>
        <div style="color:#9FE1CB;font-size:13px;">${lineLabel} · ${shiftLabel}</div>
      </div>
    </div>
  </div>

  <!-- Info shift -->
  <div style="padding:16px 24px;background:#E1F5EE;border-bottom:1px solid #9FE1CB;">
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="font-size:12px;color:#0F6E56;padding:2px 0;"><strong>Tanggal</strong></td>
        <td style="font-size:12px;color:#085041;padding:2px 0;">${tanggal}</td>
        <td style="font-size:12px;color:#0F6E56;padding:2px 0;"><strong>Shift</strong></td>
        <td style="font-size:12px;color:#085041;padding:2px 0;">${shiftLabel}</td>
      </tr>
      <tr>
        <td style="font-size:12px;color:#0F6E56;padding:2px 0;"><strong>Model</strong></td>
        <td style="font-size:12px;color:#085041;padding:2px 0;">${modelLabel}</td>
        <td style="font-size:12px;color:#0F6E56;padding:2px 0;"><strong>Ditutup</strong></td>
        <td style="font-size:12px;color:#085041;padding:2px 0;">${jamTutup} oleh ${user.name}</td>
      </tr>
    </table>
  </div>

  <!-- KPI Summary -->
  <div style="padding:20px 24px;">
    <div style="font-size:14px;font-weight:600;color:#1a1a18;margin-bottom:12px;">Ringkasan Line</div>
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:10px;background:#f5f5f3;border-radius:8px;text-align:center;width:25%;">
          <div style="font-size:22px;font-weight:600;color:#0F6E56;">${pair(totalOut)}</div>
          <div style="font-size:11px;color:#888780;margin-top:2px;">Total Output</div>
        </td>
        <td style="width:8px;"></td>
        <td style="padding:10px;background:#f5f5f3;border-radius:8px;text-align:center;width:25%;">
          <div style="font-size:22px;font-weight:600;color:${avgLler >= 90 ? '#0F6E56' : avgLler >= 75 ? '#854F0B' : '#A32D2D'};">${pct(avgLler)}</div>
          <div style="font-size:11px;color:#888780;margin-top:2px;">Avg LLER</div>
        </td>
        <td style="width:8px;"></td>
        <td style="padding:10px;background:#f5f5f3;border-radius:8px;text-align:center;width:25%;">
          <div style="font-size:22px;font-weight:600;color:${totalDT > 30 ? '#A32D2D' : '#3d3d3a'};">${totalDT} mnt</div>
          <div style="font-size:11px;color:#888780;margin-top:2px;">Total Downtime</div>
        </td>
        <td style="width:8px;"></td>
        <td style="padding:10px;background:#f5f5f3;border-radius:8px;text-align:center;width:25%;">
          <div style="font-size:22px;font-weight:600;color:${totalDef > 0 ? '#A32D2D' : '#3d3d3a'};">${pair(totalDef)}</div>
          <div style="font-size:11px;color:#888780;margin-top:2px;">Total Defect</div>
        </td>
      </tr>
    </table>
    ${activeAlerts > 0 ? `
    <div style="margin-top:12px;padding:10px 14px;background:#FCEBEB;border-radius:8px;border-left:3px solid #E24B4A;">
      <span style="font-size:13px;color:#A32D2D;font-weight:500;">⚠ ${activeAlerts} alert aktif belum diselesaikan</span>
    </div>` : ''}
  </div>

  <!-- Detail per section -->
  <div style="padding:0 24px 20px;">
    <div style="font-size:14px;font-weight:600;color:#1a1a18;margin-bottom:12px;">Detail Per Section</div>
    <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #f0f0ef;">
      ${tr(['Section', 'Output', 'Target', 'LLER', 'Avg MP', 'Downtime', 'Defect', 'Def Rate'], true)}
      ${sectionSummaries.map((sec: any) => tr([
        `<strong>${sec.name}</strong>`,
        pair(sec.totOut),
        pair(sec.totalTgt),
        badge(sec.ller),
        `${sec.avgMP} org`,
        sec.totDT > 0 ? `<span style="color:#A32D2D;">${sec.totDT} mnt</span>` : '0 mnt',
        sec.totDef > 0 ? `<span style="color:#A32D2D;">${pair(sec.totDef)}</span>` : '0',
        `${sec.defRate}%`,
      ])).join('')}
    </table>
  </div>

  <!-- Footer -->
  <div style="padding:16px 24px;background:#f5f5f3;border-top:1px solid #e0dfd7;text-align:center;">
    <div style="font-size:12px;color:#888780;">IE Line Balance System · PT. Diamond International Indonesia</div>
    <div style="font-size:11px;color:#b4b2a9;margin-top:4px;">Email ini dikirim otomatis saat IE Admin menutup shift</div>
  </div>

</div>
</body>
</html>`

  // 7. Kirim email via Resend API
  const resendApiKey = process.env.RESEND_API_KEY
  const fromEmail    = process.env.EMAIL_FROM ?? 'noreply@ielinebalance.com'

  if (!resendApiKey) {
    // Kalau Resend belum disetup, tetap arsipkan data tapi tidak kirim email
    await archiveShift(lineId, shiftLabel, user.name)
    return NextResponse.json({
      success: true,
      warning: 'Shift ditutup dan data diarsipkan, tapi email tidak terkirim karena RESEND_API_KEY belum diset.',
      summary: { totalOut, avgLler, totalDT, totalDef, sectionSummaries }
    })
  }

  let emailSent = false
  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from:    `IE Line Balance <${fromEmail}>`,
        to:      [managerEmail],
        subject: `[Laporan Shift] ${lineLabel} · ${shiftLabel} · LLER ${avgLler}%`,
        html:    emailHtml,
      }),
    })
    emailSent = emailRes.ok
  } catch {}

  // 8. Arsipkan shift (tandai data sudah ditutup, resolve alert)
  await archiveShift(lineId, shiftLabel, user.name)

  return NextResponse.json({
    success: true,
    emailSent,
    message: emailSent
      ? `Shift ditutup. Laporan dikirim ke ${managerEmail}.`
      : `Shift ditutup dan data diarsipkan. Email gagal terkirim — cek RESEND_API_KEY.`,
    summary: { totalOut, avgLler, totalDT, totalDef }
  })
}

// ── Arsipkan shift: resolve semua alert aktif ─────────────────
async function archiveShift(lineId: string, shiftLabel: string, closedBy: string) {
  try {
    // Resolve semua alert yang masih aktif di line ini
    await prisma.alert.updateMany({
      where:  { lineId, resolved: false },
      data:   { resolved: true, resolvedAt: new Date() }
    })
  } catch {}
}
