import { PrismaClient, Role } from "@prisma/client"
import bcrypt from "bcryptjs"

const db = new PrismaClient()
const password = "Staging123!"

async function seedCompany(code: string, name: string) {
  const company = await db.company.upsert({ where: { code }, update: { name, active: true }, create: { code, name } })
  const hash = await bcrypt.hash(password, 10)
  const admin = await db.user.upsert({
    where: { companyId_email: { companyId: company.id, email: "ie@demo.local" } },
    update: { password: hash, active: true },
    create: { companyId: company.id, name: `IE ${code}`, email: "ie@demo.local", password: hash, role: Role.IE_ADMIN },
  })
  const leader = await db.user.upsert({
    where: { companyId_email: { companyId: company.id, email: "leader@demo.local" } },
    update: { password: hash, active: true },
    create: { companyId: company.id, name: `Leader ${code}`, email: "leader@demo.local", password: hash, role: Role.TEAM_LEADER, building: "X" },
  })
  const line = await db.line.upsert({
    where: { companyId_building_lineNo: { companyId: company.id, building: "X", lineNo: 1 } },
    update: { active: true }, create: { companyId: company.id, building: "X", lineNo: 1 },
  })
  await db.userLine.upsert({
    where: { userId_lineId: { userId: leader.id, lineId: line.id } }, update: {},
    create: { companyId: company.id, userId: leader.id, lineId: line.id },
  })

  for (const article of ["STYLE-01", "STYLE-02"]) {
    const model = await db.shoeModel.upsert({
      where: { companyId_name: { companyId: company.id, name: `Demo ${article}` } }, update: {},
      create: { companyId: company.id, name: `Demo ${article}`, article },
    })
    const section = await db.section.upsert({
      where: { modelId_name: { modelId: model.id, name: "Stockfit" } }, update: {},
      create: { companyId: company.id, modelId: model.id, name: "Stockfit", stdMP: 10, taktTime: 36, hourlyTarget: 100 },
    })
    if (!(await db.operation.findFirst({ where: { companyId: company.id, sectionId: section.id } }))) {
      await db.operation.create({ data: { companyId: company.id, sectionId: section.id, seq: 1, name: "Assembly", va: 300 } })
    }
    if (!(await db.lineAssignment.findFirst({ where: { companyId: company.id, lineId: line.id, modelId: model.id, active: true } }))) {
      await db.lineAssignment.create({ data: { companyId: company.id, lineId: line.id, modelId: model.id, assignedBy: admin.id } })
    }
  }
}

async function main() {
  await seedCompany("DEMO-A", "Demo Company A")
  await seedCompany("DEMO-B", "Demo Company B")
  console.log("PASS: DEMO-A and DEMO-B are ready")
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => db.$disconnect())
