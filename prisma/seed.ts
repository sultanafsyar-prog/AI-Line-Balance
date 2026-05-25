import { PrismaClient, LineType } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
const BUILDINGS = { C: 1, D: 6, E: 6, F: 5, H: 5, I: 4, G: 7 }

async function main() {
  console.log('🌱 Seeding database...')

  const password = await bcrypt.hash('password123', 12)

  const users = await Promise.all([
    prisma.user.upsert({ where: { email: 'ie.admin@factory.com' }, update: {}, create: { name: 'IE Admin', email: 'ie.admin@factory.com', password, role: 'IE_ADMIN' as any } }),
    prisma.user.upsert({ where: { email: 'ie.operator@factory.com' }, update: {}, create: { name: 'IE Operator', email: 'ie.operator@factory.com', password, role: 'IE_OPERATOR' as any } }),
    prisma.user.upsert({ where: { email: 'leader.d1@factory.com' }, update: {}, create: { name: 'Leader D-1', email: 'leader.d1@factory.com', password, role: 'TEAM_LEADER' as any } }),
    prisma.user.upsert({ where: { email: 'manager@factory.com' }, update: {}, create: { name: 'Factory Manager', email: 'manager@factory.com', password, role: 'MANAGEMENT' as any } }),
  ])
  console.log(`✅ ${users.length} users created`)

  for (const [building, lineCount] of Object.entries(BUILDINGS)) {
    for (let i = 1; i <= lineCount; i++) {
      await prisma.line.upsert({
        where: { building_lineNo: { building, lineNo: i } },
        update: {},
        create: { building, lineNo: i, lineType: LineType.MINI },
      })
    }
  }
  console.log('✅ 34 lines created')

  console.log('\n🎉 Seed complete!\n')
  console.log('Default login:')
  console.log('  IE Admin    : ie.admin@factory.com / password123')
  console.log('  IE Operator : ie.operator@factory.com / password123')
  console.log('  Team Leader : leader.d1@factory.com / password123')
  console.log('  Manager     : manager@factory.com / password123')
}

main().catch(console.error).finally(() => prisma.$disconnect())