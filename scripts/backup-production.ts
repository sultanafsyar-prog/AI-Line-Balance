import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const dir = join('backups', `production-${stamp}`)
const sha256 = (data: string) => createHash('sha256').update(data).digest('hex')
const json = (value: unknown) => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2)

async function main() {
  await mkdir(dir, { recursive: true })
  const files: { file: string; rows?: number; sha256: string }[] = []

  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
    const tables = await tx.$queryRawUnsafe<{ table_name: string }[]>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `)
    const columns = await tx.$queryRawUnsafe(`
      SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `)
    const schemaData = json({ generatedAt: new Date().toISOString(), schema: 'public', columns })
    await writeFile(join(dir, 'schema.json'), schemaData)
    files.push({ file: 'schema.json', sha256: sha256(schemaData) })

    for (const { table_name } of tables) {
      const quoted = `"${table_name.replaceAll('"', '""')}"`
      const rows = await tx.$queryRawUnsafe<unknown[]>(`SELECT * FROM public.${quoted}`)
      const data = json(rows)
      const file = `${table_name}.json`
      await writeFile(join(dir, file), data)
      files.push({ file, rows: rows.length, sha256: sha256(data) })
    }
  }, { isolationLevel: 'RepeatableRead', timeout: 120_000 })

  for (const item of files) {
    const data = await readFile(join(dir, item.file), 'utf8')
    JSON.parse(data)
    if (sha256(data) !== item.sha256) throw new Error(`Checksum mismatch: ${item.file}`)
  }
  const manifest = json({ generatedAt: new Date().toISOString(), source: 'production/public', files })
  await writeFile(join(dir, 'manifest.json'), manifest)
  console.log(`PASS ${dir} (${files.length - 1} tables)`)
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => db.$disconnect())
