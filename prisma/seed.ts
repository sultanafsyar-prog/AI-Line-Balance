import { PrismaClient, Role, LineType } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// 34 line: C=1, D=6, E=6, F=5, H=5, I=4, G=7
const BUILDINGS: Record<string, number> = {
  C: 1,
  D: 6,
  E: 6,
  F: 5,
  H: 5,
  I: 4,
  G: 7,
}

async function main() {
  console.log('🌱 Seeding database...')

  const password = await bcrypt.hash('password123', 12)

  // ─── USERS ─────────────────────────────────────────────────────
  // Semua role menggunakan enum Role yang sesuai dengan schema.prisma
  // Role yang valid: IE_ADMIN | IE_OPERATOR | TEAM_LEADER | MANAGEMENT | IT_ADMIN
  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'ie.admin@factory.com' },
      update: {},
      create: {
        name: 'IE Admin',
        email: 'ie.admin@factory.com',
        password,
        role: Role.IE_ADMIN,
      },
    }),
    prisma.user.upsert({
      where: { email: 'ie.operator@factory.com' },
      update: {},
      create: {
        name: 'IE Operator',
        email: 'ie.operator@factory.com',
        password,
        role: Role.IE_OPERATOR,
      },
    }),
    prisma.user.upsert({
      where: { email: 'leader.d1@factory.com' },
      update: {},
      create: {
        name: 'Team Leader D-1',
        email: 'leader.d1@factory.com',
        password,
        role: Role.TEAM_LEADER,
        building: 'D',
      },
    }),
    prisma.user.upsert({
      where: { email: 'manager@factory.com' },
      update: {},
      create: {
        name: 'Factory Manager',
        email: 'manager@factory.com',
        password,
        role: Role.MANAGEMENT,
      },
    }),
    prisma.user.upsert({
      where: { email: 'it.admin@factory.com' },
      update: {},
      create: {
        name: 'IT Admin',
        email: 'it.admin@factory.com',
        password,
        role: Role.IT_ADMIN,
      },
    }),
  ])
  console.log(`✅ ${users.length} users created`)

  // ─── LINES ─────────────────────────────────────────────────────
  let lineCount = 0
  for (const [building, count] of Object.entries(BUILDINGS)) {
    for (let i = 1; i <= count; i++) {
      await prisma.line.upsert({
        where: { building_lineNo: { building, lineNo: i } },
        update: {},
        create: {
          building,
          lineNo: i,
          lineType: LineType.MINI,
        },
      })
      lineCount++
    }
  }
  console.log(`✅ ${lineCount} lines created`)

  // ─── ASSIGN LEADER D-1 KE LINE D-1 ────────────────────────────
  const leaderD1 = await prisma.user.findUnique({ where: { email: 'leader.d1@factory.com' } })
  const lineD1   = await prisma.line.findFirst({ where: { building: 'D', lineNo: 1 } })

  if (leaderD1 && lineD1) {
    await prisma.userLine.upsert({
      where: { userId_lineId: { userId: leaderD1.id, lineId: lineD1.id } },
      update: {},
      create: { userId: leaderD1.id, lineId: lineD1.id },
    })
    console.log('✅ Leader D-1 assigned to line D-1')
  }

  console.log('\n🎉 Seed complete!\n')
  console.log('Default login:')
  console.log('  IE Admin      : ie.admin@factory.com      / password123')
  console.log('  IE Operator   : ie.operator@factory.com   / password123')
  console.log('  Team Leader   : leader.d1@factory.com     / password123')
  console.log('  Manager       : manager@factory.com       / password123')
  console.log('  IT Admin      : it.admin@factory.com      / password123')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
