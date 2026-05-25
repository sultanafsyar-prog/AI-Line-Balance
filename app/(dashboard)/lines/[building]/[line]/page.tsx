import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import { today, SECTIONS, SF_SECTIONS, isIE } from '@/lib/utils'
import LineDetailClient from './client'

interface Props { params: { building: string; line: string } }

export default async function LineDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions)
  const building = params.building.toUpperCase()
  const lineNo = parseInt(params.line)

  const line = await prisma.line.findUnique({
    where: { building_lineNo: { building, lineNo } },
    include: {
      assignments: {
        where: { active: true }, take: 1, orderBy: { assignedAt: 'desc' },
        include: { model: { include: {
          sections: { include: { operations: { orderBy: { seq: 'asc' } } } }
        }}}
      },
      actuals: { where: { date: today() }, include: { section: true }, orderBy: { hour: 'asc' } },
      alerts: { where: { resolved: false }, orderBy: { triggeredAt: 'desc' } },
    }
  })

  if (!line) notFound()

  const allModels = isIE((session?.user as any)?.role)
    ? await prisma.shoeModel.findMany({ where: { active: true }, select: { id: true, name: true, article: true, lineType: true } })
    : []

  return (
    <LineDetailClient
      line={line as any}
      allModels={allModels}
      user={session?.user as any}
      sections={building === 'G' ? SF_SECTIONS : SECTIONS}
    />
  )
}
