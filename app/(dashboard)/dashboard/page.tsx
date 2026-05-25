import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { BUILDINGS, today } from '@/lib/utils'
import Link from 'next/link'

async function getDashboardData() {
  const lines = await prisma.line.findMany({ include: {
    assignments: { where: { active: true }, include: { model: true }, take: 1 },
    actuals: { where: { date: today() } },
    alerts: { where: { resolved: false } },
  }})

  const models = await prisma.shoeModel.count({ where: { active: true } })
  const activeToday = lines.filter(l => l.actuals.length > 0).length
  const activeAlerts = lines.reduce((s, l) => s + l.alerts.length, 0)
  return { lines, models, activeToday, activeAlerts }
}

function getLineStatus(line: any) {
  if (line.actuals.length > 0) return 'active'
  if (line.assignments.length > 0) return 'assigned'
  return 'idle'
}

const dotColor: Record<string, string> = {
  active: 'bg-teal', assigned: 'bg-amber-400', idle: 'bg-gray-300'
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  const { lines, models, activeToday, activeAlerts } = await getDashboardData()

  const linesByBuilding = lines.reduce((acc, line) => {
    if (!acc[line.building]) acc[line.building] = []
    acc[line.building].push(line)
    return acc
  }, {} as Record<string, typeof lines>)

  const userBuilding = (session?.user as any)?.building

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Line overview</h1>
        <p className="text-sm text-gray-500 mt-1">
          {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total line', value: Object.values(BUILDINGS).reduce((a, b) => a + b, 0), color: '' },
          { label: 'Aktif hari ini', value: activeToday, color: 'text-teal' },
          { label: 'Models aktif', value: models, color: 'text-amber-600' },
          { label: 'Alert aktif', value: activeAlerts, color: activeAlerts > 0 ? 'text-red-600' : 'text-gray-900' },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{s.label}</div>
            <div className={`text-3xl font-semibold ${s.color || 'text-gray-900'}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-4">
        {[['bg-teal', 'Aktif'], ['bg-amber-400', 'Ada model'], ['bg-gray-300', 'Kosong']].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={`w-2 h-2 rounded-full ${c}`} />{l}
          </span>
        ))}
      </div>

      {/* Buildings grid */}
      <div className="space-y-4">
        {Object.entries(BUILDINGS)
          .filter(([b]) => !userBuilding || userBuilding === b)
          .map(([building, lineCount]) => {
            const buildingLines = (linesByBuilding[building] ?? []).sort((a, b) => a.lineNo - b.lineNo)
            const isStockfit = building === 'G'
            return (
              <div key={building} className="card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">Gedung {building}</span>
                    {isStockfit && <span className="badge badge-warn">Stockfit</span>}
                  </div>
                  <span className="text-xs text-gray-400">{lineCount} line</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                  {buildingLines.map(line => {
                    const st = getLineStatus(line)
                    const model = line.assignments[0]?.model
                    const alerts = line.alerts.length
                    return (
                      <Link key={line.id}
                        href={`/lines/${line.building}/${line.lineNo}`}
                        className="flex flex-col gap-1 p-2.5 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-100">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1 text-sm font-medium text-gray-800">
                            <span className={`w-2 h-2 rounded-full ${dotColor[st]}`} />
                            Line {line.lineNo}
                          </span>
                          {alerts > 0 && (
                            <span className="w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                              {alerts}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-400 truncate">
                          {model ? `${model.name}` : '—'}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}
