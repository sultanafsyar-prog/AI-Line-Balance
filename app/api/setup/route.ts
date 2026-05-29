import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { jsonError } from '@/lib/api-helpers'

/**
 * GET /api/setup?token=<SETUP_SECRET>
 *
 * SECURITY:
 * - Endpoint ini SANGAT SENSITIF. Hanya jalankan saat seed awal.
 * - Setelah seed berhasil:
 *     1. Set SETUP_ENABLED=false di Vercel env vars (atau hapus)
 *     2. Rotate SETUP_SECRET supaya token lama tidak bisa dipakai
 */

const BUILDINGS: Record<string, number> = {
  C: 1, D: 6, E: 6, F: 5, H: 5, I: 4, G: 7,
}

export async function GET(req: NextRequest) {
  if (process.env.SETUP_ENABLED !== 'true') {
    return jsonError('Setup endpoint disabled. Set SETUP_ENABLED=true to enable.', 403)
  }

  const setupSecret = process.env.SETUP_SECRET
  if (!setupSecret) {
    return jsonError('SETUP_SECRET environment variable is not set.', 500)
  }

  const token = new URL(req.url).searchParams.get('token')
  if (!token || token !== setupSecret) {
    return jsonError('Unauthorized', 401)
  }

  try {
    const results: string[] = []
    const password = await bcrypt.hash('password123', 12)

    const usersData = [
      { name: 'IE Admin',        email: 'ie.admin@factory.com',    role: 'IE_ADMIN'    as const, building: null },
      { name: 'IE Operator',     email: 'ie.operator@factory.com', role: 'IE_OPERATOR' as const, building: null },
      { name: 'Team Leader D-1', email: 'leader.d1@factory.com',   role: 'TEAM_LEADER' as const, building: 'D'  },
      { name: 'Factory Manager', email: 'manager@factory.com',     role: 'MANAGEMENT'  as const, building: null },
      { name: 'IT Admin',        email: 'it.admin@factory.com',    role: 'IT_ADMIN'    as const, building: null },
    ]

    for (const u of usersData) {
      await prisma.user.upsert({
        where:  { email: u.email },
        update: {},
        create: { name: u.name, email: u.email, password, role: u.role, building: u.building },
      })
    }
    results.push(`✅ ${usersData.length} users created`)

    let lineCount = 0
    for (const [building, count] of Object.entries(BUILDINGS)) {
      for (let i = 1; i <= count; i++) {
        await prisma.line.upsert({
          where:  { building_lineNo: { building, lineNo: i } },
          update: {},
          create: { building, lineNo: i, lineType: 'MINI' },
        })
        lineCount++
      }
    }
    results.push(`✅ ${lineCount} lines created`)

    const leaderD1 = await prisma.user.findUnique({ where: { email: 'leader.d1@factory.com' } })
    const lineD1   = await prisma.line.findFirst({ where: { building: 'D', lineNo: 1 } })
    if (leaderD1 && lineD1) {
      await prisma.userLine.upsert({
        where:  { userId_lineId: { userId: leaderD1.id, lineId: lineD1.id } },
        update: {},
        create: { userId: leaderD1.id, lineId: lineD1.id },
      })
      results.push('✅ Leader assigned to D-1')
    }

    return NextResponse.json({
      success: true,
      results,
      reminder: 'PENTING: Set SETUP_ENABLED=false dan rotate SETUP_SECRET sekarang.',
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
