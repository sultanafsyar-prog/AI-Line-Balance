import { PrismaClient, Role, LineType } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const BUILDINGS = { C: 1, D: 6, E: 6, F: 5, H: 5, I: 4, G: 7 }

async function main() {
  console.log('🌱 Seeding database...')

  // ─── USERS ─────────────────────────────────────────────────
  const password = await bcrypt.hash('password123', 12)

  const users = await Promise.all([
    prisma.user.upsert({ where: { email: 'ie.admin@factory.com' }, update: {}, create: { name: 'IE Admin', email: 'ie.admin@factory.com', password, role: Role.IE_ADMIN } }),
    prisma.user.upsert({ where: { email: 'ie.operator@factory.com' }, update: {}, create: { name: 'IE Operator', email: 'ie.operator@factory.com', password, role: Role.IE_OPERATOR } }),
    prisma.user.upsert({ where: { email: 'prod.supervisor@factory.com' }, update: {}, create: { name: 'Supervisor Gedung D', email: 'prod.supervisor@factory.com', password, role: Role.PRODUCTION_SUPERVISOR, building: 'D' } }),
    prisma.user.upsert({ where: { email: 'prod.operator@factory.com' }, update: {}, create: { name: 'Operator D-1', email: 'prod.operator@factory.com', password, role: Role.PRODUCTION_OPERATOR, building: 'D' } }),
    prisma.user.upsert({ where: { email: 'manager@factory.com' }, update: {}, create: { name: 'Factory Manager', email: 'manager@factory.com', password, role: Role.MANAGEMENT } }),
  ])
  console.log(`✅ ${users.length} users created`)

  // ─── LINES ─────────────────────────────────────────────────
  for (const [building, lineCount] of Object.entries(BUILDINGS)) {
    for (let i = 1; i <= lineCount; i++) {
      await prisma.line.upsert({
        where: { building_lineNo: { building, lineNo: i } },
        update: {},
        create: { building, lineNo: i, lineType: LineType.MINI },
      })
    }
  }
  console.log(`✅ ${Object.values(BUILDINGS).reduce((a, b) => a + b, 0)} lines created`)

  // ─── SAMPLE MODEL: U740 ────────────────────────────────────
  const model = await prisma.shoeModel.upsert({
    where: { name: 'U740' },
    update: {},
    create: {
      name: 'U740',
      article: 'U-740',
      stage: 'Production CFM',
      lineType: LineType.MINI,
      uploadedFrom: 'NB_Standard_U740.xlsx (seed)',
      sections: {
        create: [
          {
            name: 'Cutting', stdMP: 4.5, taktTime: 36,
            operations: { create: [
              { seq: 1, name: 'Auto cutting insole', va: 13, nvan: 0, nva: 5, mcCT: 0 },
              { seq: 2, name: 'Manual cut vamp', va: 18, nvan: 0, nva: 0, mcCT: 0 },
              { seq: 3, name: 'Manual cut tongue', va: 12, nvan: 0, nva: 0, mcCT: 0 },
              { seq: 4, name: 'Manual cut quarter', va: 15, nvan: 0, nva: 0, mcCT: 0 },
              { seq: 5, name: 'Die cut insole', va: 10, nvan: 0, nva: 3, mcCT: 0 },
            ]}
          },
          {
            name: 'Preparation', stdMP: 8.75, taktTime: 36,
            operations: { create: [
              { seq: 1, name: 'Cutting loop', va: 0, nvan: 5, nva: 0, mcCT: 1.4 },
              { seq: 2, name: 'Skiving toe overlay', va: 12.2, nvan: 2.3, nva: 0, mcCT: 8.7 },
              { seq: 3, name: 'Buffing heel cap', va: 6.6, nvan: 2.3, nva: 0, mcCT: 7.3 },
              { seq: 4, name: 'Auto press roller toe overlay', va: 20.4, nvan: 4.5, nva: 0, mcCT: 1.4 },
              { seq: 5, name: 'Stitching vamp tape', va: 33.3, nvan: 4.6, nva: 0, mcCT: 14.2 },
            ]}
          },
          {
            name: 'PC Sewing', stdMP: 14, taktTime: 36,
            operations: { create: [
              { seq: 1, name: 'CS heel cap medial', va: 35.7, nvan: 16, nva: 0, mcCT: 30.3 },
              { seq: 2, name: 'CS heel cap lateral', va: 23.2, nvan: 7.4, nva: 0, mcCT: 19.3 },
              { seq: 3, name: 'CS eyestay vamp top', va: 38.5, nvan: 8.3, nva: 0, mcCT: 26.2 },
              { seq: 4, name: 'CS eyestay', va: 10.6, nvan: 10.3, nva: 0, mcCT: 10.3 },
              { seq: 5, name: 'CS vamp toe overlay', va: 52.7, nvan: 7.8, nva: 0, mcCT: 17.3 },
            ]}
          },
          {
            name: 'Sewing', stdMP: 36, taktTime: 36,
            operations: { create: [
              { seq: 1, name: 'Tongue lining', va: 3.5, nvan: 1.9, nva: 0, mcCT: 1.6 },
              { seq: 2, name: 'Stitching heel tab', va: 9.2, nvan: 13.8, nva: 0, mcCT: 7.2 },
              { seq: 3, name: 'Press size label', va: 8.5, nvan: 5.4, nva: 0, mcCT: 7.5 },
              { seq: 4, name: 'Stitching tongue deco', va: 13.6, nvan: 10.4, nva: 0, mcCT: 9.6 },
              { seq: 5, name: 'Stitching tongue tape', va: 14.3, nvan: 8.1, nva: 0, mcCT: 7.3 },
              { seq: 6, name: 'Stitching vamp', va: 18.2, nvan: 5.8, nva: 0, mcCT: 9.1 },
              { seq: 7, name: 'Stitching quarter', va: 19.5, nvan: 4.2, nva: 0, mcCT: 8.4 },
            ]}
          },
          {
            name: 'Assembly', stdMP: 31.5, taktTime: 36,
            operations: { create: [
              { seq: 1, name: 'Persiapan upper & insole', va: 0, nvan: 15, nva: 0, mcCT: 0 },
              { seq: 2, name: 'Heating & heel activation', va: 11, nvan: 4, nva: 0, mcCT: 25 },
              { seq: 3, name: 'Hot & cold press heel', va: 4.8, nvan: 8.2, nva: 0, mcCT: 25 },
              { seq: 4, name: 'Jahit insole strobel', va: 42.7, nvan: 5, nva: 0, mcCT: 34.6 },
              { seq: 5, name: 'Insert last', va: 22, nvan: 0, nva: 0, mcCT: 0 },
              { seq: 6, name: 'Heel lasting', va: 17, nvan: 0, nva: 0, mcCT: 13 },
              { seq: 7, name: 'Tightening last', va: 36.5, nvan: 0, nva: 6, mcCT: 0 },
              { seq: 8, name: 'Marking on tip & heel', va: 23, nvan: 0, nva: 7, mcCT: 0 },
              { seq: 9, name: 'Gauge marking', va: 22.5, nvan: 0, nva: 8, mcCT: 0 },
              { seq: 10, name: 'Cleaner & primer sole', va: 47.3, nvan: 0, nva: 0, mcCT: 0 },
              { seq: 11, name: 'Cleaner & primer upper', va: 67, nvan: 0, nva: 0, mcCT: 0 },
              { seq: 12, name: 'Cement sole & upper', va: 75, nvan: 0, nva: 0, mcCT: 0 },
              { seq: 13, name: 'Attaching sole & upper', va: 71, nvan: 0, nva: 0, mcCT: 0 },
              { seq: 14, name: 'Sole pressing', va: 19, nvan: 0, nva: 0, mcCT: 0 },
              { seq: 15, name: 'Loose lacing & delast', va: 19, nvan: 0, nva: 0, mcCT: 7 },
              { seq: 16, name: 'Insert sockliner', va: 9, nvan: 0, nva: 0, mcCT: 0 },
              { seq: 17, name: 'Lace tightening', va: 40, nvan: 0, nva: 0, mcCT: 0 },
            ]}
          },
          {
            name: 'Packing', stdMP: 5, taktTime: 36,
            operations: { create: [
              { seq: 1, name: 'Cleaning shoe', va: 17, nvan: 0, nva: 0, mcCT: 0 },
              { seq: 2, name: 'Insert paper & sticker', va: 35, nvan: 0, nva: 0, mcCT: 0 },
              { seq: 3, name: 'Folding box', va: 23, nvan: 0, nva: 0, mcCT: 0 },
              { seq: 4, name: 'Packing & stamp', va: 26, nvan: 0, nva: 0, mcCT: 0 },
            ]}
          },
          {
            name: 'Stockfit', stdMP: 59.25, taktTime: 14.4,
            operations: { create: [
              { seq: 1, name: 'Buffing outsole', va: 0, nvan: 7, nva: 0, mcCT: 0 },
              { seq: 2, name: 'Cement outsole', va: 18, nvan: 0, nva: 0, mcCT: 0 },
              { seq: 3, name: 'Attach midsole', va: 30, nvan: 0, nva: 0, mcCT: 0 },
              { seq: 4, name: 'Press cold', va: 15, nvan: 0, nva: 0, mcCT: 12 },
              { seq: 5, name: 'QC sole', va: 12, nvan: 0, nva: 5, mcCT: 0 },
            ]}
          },
        ]
      }
    }
  })
  console.log(`✅ Model ${model.name} created`)

  // ─── ASSIGN MODEL KE LINE D-1 & D-2 ───────────────────────
  const lineD1 = await prisma.line.findUnique({ where: { building_lineNo: { building: 'D', lineNo: 1 } } })
  const lineD2 = await prisma.line.findUnique({ where: { building_lineNo: { building: 'D', lineNo: 2 } } })
  const ieUser = users[0]

  if (lineD1) {
    await prisma.lineAssignment.upsert({
      where: { id: 'seed-assign-d1' },
      update: {},
      create: { id: 'seed-assign-d1', lineId: lineD1.id, modelId: model.id, assignedBy: ieUser.id }
    })
  }
  if (lineD2) {
    await prisma.lineAssignment.upsert({
      where: { id: 'seed-assign-d2' },
      update: {},
      create: { id: 'seed-assign-d2', lineId: lineD2.id, modelId: model.id, assignedBy: ieUser.id }
    })
  }
  console.log('✅ Model assigned to D-1 and D-2')

  console.log('\n🎉 Seed complete!\n')
  console.log('Default login:')
  console.log('  IE Admin       : ie.admin@factory.com / password123')
  console.log('  IE Operator    : ie.operator@factory.com / password123')
  console.log('  Supervisor     : prod.supervisor@factory.com / password123')
  console.log('  Operator       : prod.operator@factory.com / password123')
  console.log('  Manager        : manager@factory.com / password123')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
