import { prisma } from '@/lib/db'
import { today, SECTIONS, SF_SECTIONS } from '@/lib/utils'
import TVClient from './client'
import { notFound } from 'next/navigation'

interface Props { params: { building: string } }

const BUILDINGS: Record<string, number> = {
  C: 1, D: 6, E: 6, F: 5, H: 5, I: 4, G: 7
}

export default async function TVPage({ params }: Props) {
  const building = params.building.toUpperCase()
  if (!BUILDINGS[building]) notFound()

  const lines = await prisma.line.findMany({
    where: { building },
    orderBy: { lineNo: 'asc' },
    include: {
      assignments: {
        where: { active: true }, take: 1, orderBy: { assignedAt: 'desc' },
        include: {
          model: {
            include: {
              sections: { include: { operations: true } }
            }
          }
        }
      },
      actuals: {
        where: { date: today() },
        include: { section: true },
        orderBy: { hour: 'asc' }
      },
      alerts: {
        where: { resolved: false },
        orderBy: { triggeredAt: 'desc' },
        take: 3
      }
    }
  })

  const sections = building === 'G' ? SF_SECTIONS : SECTIONS

  return (
    <TVClient
      building={building}
      lines={lines as any}
      sections={sections}
    />
  )
}
