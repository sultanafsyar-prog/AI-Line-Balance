import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

/**
 * GET /api/setup?token=<SETUP_SECRET>
 *
 * SECURITY:
 * - Token diambil dari environment variable SETUP_SECRET, bukan hardcode
 * - Setelah seed berhasil, HAPUS file ini atau set SETUP_ENABLED=false di Vercel
 * - Jangan pernah commit token ke GitHub
 *
 * Setup di Vercel Environment Variables:
 *   SETUP_SECRET = <random string panjang, misal: openssl rand -hex 32>
 *   SETUP_ENABLED = true   (setelah setup selesai, ganti jadi false atau hapus)
 */

const BUILDINGS: Record<string, number> = {
  C: 1, D: 6, E: 6, F: 5, H: 5, I: 4, G: 7,
}

export async function GET(req: NextRequest) {
  // ── 1. Cek apakah setup diizinkan ──────────────────────────────
  if (process.env.SETUP_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'Setup endpoint is disabled. Set SETUP_ENABLED=true in environment variables to enable.' },
      { status: 403 }
    )
  }

  // ── 2. Validasi token dari env variable ────────────────────────
  const setupSecret = process.env.SETUP_SECRET
  if (!setupSecret) {
    return NextResponse.json(
      { error: 'SETUP_SECRET environment variable is not set.' },
      { status: 500 }
    )
  }

  const token = new URL(req.url).searchParams.get('token')
  if (!token || token !== setupSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 3. Jalankan seed ───────────────────────────────────────────
  try {
    const results: string[] = []
    const password = await bcrypt.hash('password123', 12)

    const usersData = [
      { name: 'IE Admin',        email: 'ie.admin@factory.com',    role: 'IE_ADMIN'    },
      { name: 'IE Operator',     email: 'ie.operator@factory.com', role: 'IE_OPERATOR' },
      { name: 'Team Leader D-1', email: 'leader.d1@factory.com',   role: 'TEAM_LEADER', building: 'D' },
      { name: 'Factory Manager', email: 'manager@factory.com',     role: 'MANAGEMENT'  },
      { name: 'IT Admin',        email: 'it.admin@factory.com',    role: 'IT_ADMIN'    },
    ]

    for (const u of usersData) {
      await prisma.user.upsert({
        where: { email: u.email },
        update: {},
        create: {
          name: u.name,
          email: u.email,
          password,
          role: u.role as any,
          building: (u as any).building ?? null,
        },
      })
    }
    results.push(`✅ ${usersData.length} users created`)

    let lineCount = 0
    for (const [building, count] of Object.entries(BUILDINGS)) {
      for (let i = 1; i <= count; i++) {
        await prisma.line.upsert({
          where: { building_lineNo: { building, lineNo: i } },
          update: {},
          create: { building, lineNo: i, lineType: 'MINI' as any },
        })
        lineCount++
      }
    }
    results.push(`✅ ${lineCount} lines created`)

    // Assign leader D-1 ke line D-1
    const leaderD1 = await prisma.user.findUnique({ where: { email: 'leader.d1@factory.com' } })
    const lineD1   = await prisma.line.findFirst({ where: { building: 'D', lineNo: 1 } })
    if (leaderD1 && lineD1) {
      await prisma.userLine.upsert({
        where: { userId_lineId: { userId: leaderD1.id, lineId: lineD1.id } },
        update: {},
        create: { userId: leaderD1.id, lineId: lineD1.id },
      })
      results.push('✅ Leader assigned to D-1')
    }

    return NextResponse.json({ success: true, results })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
