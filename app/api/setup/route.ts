import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

const BUILDINGS: Record<string, number> = { C:1, D:6, E:6, F:5, H:5, I:4, G:7 }

// GET /api/setup?key=setup-ie-lb-2024
// Jalankan SEKALI untuk isi data awal, lalu HAPUS file ini
export async function GET(req: NextRequest) {
  const key = new URL(req.url).searchParams.get('key')
  if (key !== 'setup-ie-lb-2024')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const results: string[] = []

    // ─── 1. USERS DEFAULT ────────────────────────────────────
    // Ganti email & password setelah pertama login!
    const password = await bcrypt.hash('password123', 12)
    const users = [
      { name: 'IE Admin',         email: 'ie.admin@factory.com',        role: 'IE_ADMIN',              building: null },
      { name: 'IE Operator',      email: 'ie.operator@factory.com',     role: 'IE_OPERATOR',           building: null },
      { name: 'Supervisor',       email: 'prod.supervisor@factory.com', role: 'PRODUCTION_SUPERVISOR', building: null },
      { name: 'Operator',         email: 'prod.operator@factory.com',   role: 'PRODUCTION_OPERATOR',   building: null },
      { name: 'Factory Manager',  email: 'manager@factory.com',         role: 'MANAGEMENT',            building: null },
    ]
    for (const u of users) {
      await prisma.user.upsert({
        where: { email: u.email }, update: {},
        create: { ...u, password, role: u.role as any }
      })
    }
    results.push(`✅ ${users.length} default users created`)

    // ─── 2. LINES (struktur gedung & line) ───────────────────
    // Ini data tetap — struktur pabrik tidak berubah
    let lineCount = 0
    for (const [building, count] of Object.entries(BUILDINGS)) {
      for (let i = 1; i <= count; i++) {
        await prisma.line.upsert({
          where: { building_lineNo: { building, lineNo: i } },
          update: {},
          create: { building, lineNo: i, lineType: 'MINI' }
        })
        lineCount++
      }
    }
    results.push(`✅ ${lineCount} lines created (7 gedung, C/D/E/F/G/H/I)`)
    results.push('ℹ️ Model sepatu: upload lewat menu Model Library setelah login')

    return NextResponse.json({
      success: true,
      message: '🎉 Setup berhasil! Hapus file ini sekarang, lalu login.',
      results,
      next_steps: [
        '1. Hapus file app/api/setup/route.ts',
        '2. Login sebagai IE Admin',
        '3. Ganti password default di User Management',
        '4. Upload model sepatu lewat Model Library → Upload NB Standard',
        '5. Assign model ke line produksi',
      ],
      logins: [
        { role: 'IE Admin',    email: 'ie.admin@factory.com',        password: 'password123' },
        { role: 'IE Operator', email: 'ie.operator@factory.com',     password: 'password123' },
        { role: 'Supervisor',  email: 'prod.supervisor@factory.com', password: 'password123' },
        { role: 'Operator',    email: 'prod.operator@factory.com',   password: 'password123' },
        { role: 'Manager',     email: 'manager@factory.com',         password: 'password123' },
      ]
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}