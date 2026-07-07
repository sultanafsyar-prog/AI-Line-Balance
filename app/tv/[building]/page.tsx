import { prisma } from '@/lib/db'
import { today, SECTIONS, SF_SECTIONS } from '@/lib/utils'
import { getTvStdLines } from '@/lib/std-cache'
import TVClient from './client'
import { notFound } from 'next/navigation'

interface Props { params: { building: string } }

const BUILDINGS: Record<string, number> = {
  C: 1, D: 6, E: 6, F: 5, H: 5, I: 4, G: 7
}

export default async function TVPage({ params }: Props) {
  const building = params.building.toUpperCase()
  if (!BUILDINGS[building]) notFound()

  // ── Hemat egress: struktur line+model+operasi (BERAT, jarang berubah)
  // dari cache 10 menit; hanya data dinamis (actuals/alerts/target) yang
  // di-query fresh tiap auto-refresh 60 detik.
  const stdLines = await getTvStdLines(building)
  const lineIds = stdLines.map(l => l.id)

  const [actuals, alerts, dailyTargets] = await Promise.all([
    prisma.actual.findMany({
      where: { lineId: { in: lineIds }, date: today() },
      include: {
        section: { select: { id: true, name: true, model: { select: { name: true } } } },
      },
      orderBy: { hour: 'asc' },
    }),
    prisma.alert.findMany({
      where: { lineId: { in: lineIds }, resolved: false },
      orderBy: { triggeredAt: 'desc' },
    }),
    prisma.dailyTarget.findMany({
      where: { lineId: { in: lineIds }, date: today() },
    }),
  ])

  const lines = stdLines.map(l => ({
    ...l,
    actuals: actuals.filter(a => a.lineId === l.id),
    alerts: alerts.filter(a => a.lineId === l.id).slice(0, 3),
    dailyTargets: dailyTargets.filter(d => d.lineId === l.id).slice(0, 1),
  }))

  const sections = building === 'G' ? SF_SECTIONS : SECTIONS

  return (
    <TVClient
      building={building}
      lines={lines as any}
      sections={sections}
    />
  )
}
