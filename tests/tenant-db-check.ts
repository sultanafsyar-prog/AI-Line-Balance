import assert from "node:assert/strict"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const codes = ["CODEX-TEST-A", "CODEX-TEST-B"]

async function cleanup() {
  const ids = (await db.company.findMany({ where: { code: { in: codes } }, select: { id: true } })).map(({ id }) => id)
  if (!ids.length) return
  await db.lineAssignment.deleteMany({ where: { companyId: { in: ids } } })
  await db.shoeModel.deleteMany({ where: { companyId: { in: ids } } })
  await db.line.deleteMany({ where: { companyId: { in: ids } } })
  await db.company.deleteMany({ where: { id: { in: ids } } })
}

async function main() {
try {
  await cleanup()
  const [a, b] = await Promise.all(codes.map((code) => db.company.create({ data: { code, name: code } })))
  const [lineA, modelB] = await Promise.all([
    db.line.create({ data: { companyId: a.id, building: "TEST", lineNo: 1 } }),
    db.shoeModel.create({ data: { companyId: b.id, name: "SAME-MODEL", article: "TEST" } }),
  ])
  await db.line.create({ data: { companyId: b.id, building: "TEST", lineNo: 1 } })
  await db.shoeModel.create({ data: { companyId: a.id, name: "SAME-MODEL", article: "TEST" } })

  let rejected = false
  try {
    await db.lineAssignment.create({
      data: { companyId: a.id, lineId: lineA.id, modelId: modelB.id, assignedBy: "test" },
    })
  } catch {
    rejected = true
  }
  assert.equal(rejected, true, "database accepted a cross-company assignment")
  console.log("PASS: same names stay separate; cross-company references are rejected")
} finally {
  await cleanup()
  await db.$disconnect()
}
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
