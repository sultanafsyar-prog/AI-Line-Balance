import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(path, 'utf8')

test('schema scopes business identities by company', () => {
  const schema = read('prisma/schema.prisma')
  assert.match(schema, /model Company\s*{/)
  assert.match(schema, /@@unique\(\[companyId, email\]\)/)
  assert.match(schema, /@@unique\(\[companyId, name\]\)/)
  assert.match(schema, /@@unique\(\[companyId, building, lineNo\]\)/)
})

test('session tenant comes from company-aware login', () => {
  const auth = read('lib/auth.ts')
  assert.match(auth, /credentials\.companyCode/)
  assert.match(auth, /companyId_email/)
  assert.match(auth, /token\.companyId = user\.companyId/)
  assert.match(auth, /session\.user\.companyId = token\.companyId/)
})

test('all production data entrypoints include tenant scope', () => {
  const files = [
    'app/api/actuals/route.ts',
    'app/api/analytics/route.ts',
    'app/api/analytics/summary/route.ts',
    'app/api/daily-target/route.ts',
    'app/api/export/daily/route.ts',
    'app/api/lines/route.ts',
    'app/api/lller-trend/route.ts',
    'app/api/manager/route.ts',
    'app/api/models/route.ts',
    'app/api/monitor/route.ts',
    'app/api/shift-close/route.ts',
    'app/api/tv-insights/route.ts',
    'app/api/users/route.ts',
    'lib/shift-archive-query.ts',
    'lib/std-cache.ts',
  ]
  for (const file of files) {
    assert.match(read(file), /companyId/, `${file} kehilangan tenant scope`)
  }
})
