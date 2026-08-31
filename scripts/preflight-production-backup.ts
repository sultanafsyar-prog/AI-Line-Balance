import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

type Row = Record<string, unknown>

async function main() {
  const root = 'backups'
  const latest = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('production-'))
    .map((entry) => entry.name).sort().at(-1)
  if (!latest) throw new Error('Backup produksi tidak ditemukan')
  const dir = join(root, latest)
  const load = async (table: string) => JSON.parse(await readFile(join(dir, `${table}.json`), 'utf8')) as Row[]
  const tables = Object.fromEntries(await Promise.all([
    'User', 'UserLine', 'ShoeModel', 'DailyTarget', 'Section', 'Operation', 'Line',
    'LineAssignment', 'Actual', 'ShiftArchive', 'Alert',
  ].map(async (name) => [name, await load(name)]))) as Record<string, Row[]>

  const issues: string[] = []
  const ids = (table: string) => new Set(tables[table].map((row) => String(row.id)))
  const checkRef = (child: string, field: string, parent: string) => {
    const parentIds = ids(parent)
    const missing = tables[child].filter((row) => row[field] != null && !parentIds.has(String(row[field]))).length
    if (missing) issues.push(`${child}.${field}: ${missing} relasi yatim ke ${parent}`)
  }
  const checkUnique = (table: string, fields: string[]) => {
    const seen = new Set<string>()
    let duplicates = 0
    for (const row of tables[table]) {
      const key = fields.map((field) => String(row[field])).join('\u0000')
      if (seen.has(key)) duplicates++
      seen.add(key)
    }
    if (duplicates) issues.push(`${table}(${fields.join(',')}): ${duplicates} duplikasi`)
  }

  checkRef('UserLine', 'userId', 'User'); checkRef('UserLine', 'lineId', 'Line')
  checkRef('DailyTarget', 'lineId', 'Line'); checkRef('Section', 'modelId', 'ShoeModel')
  checkRef('Operation', 'sectionId', 'Section')
  checkRef('LineAssignment', 'lineId', 'Line'); checkRef('LineAssignment', 'modelId', 'ShoeModel')
  checkRef('Actual', 'lineId', 'Line'); checkRef('Actual', 'sectionId', 'Section'); checkRef('Actual', 'inputBy', 'User')
  checkRef('ShiftArchive', 'lineId', 'Line'); checkRef('Alert', 'lineId', 'Line')
  checkUnique('User', ['email']); checkUnique('ShoeModel', ['name']); checkUnique('Line', ['building', 'lineNo'])

  const rowCounts = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length]))
  const result = { checkedAt: new Date().toISOString(), backup: latest, rowCounts, rowsToBackfill: Object.values(rowCounts).reduce((a, b) => a + b, 0), issues, ready: issues.length === 0 }
  await writeFile(join(dir, 'preflight.json'), JSON.stringify(result, null, 2))
  console.log(`${result.ready ? 'PASS' : 'FAIL'}: ${result.rowsToBackfill} rows, ${issues.length} issues`)
  if (!result.ready) process.exitCode = 1
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
