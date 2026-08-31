import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { notFound } from 'next/navigation'
import { today, SECTIONS, SF_SECTIONS, isIE } from '@/lib/utils'
import LineDetailClient from './client'

interface Props { params: { building: string; line: string } }

export default async function LineDetailPage({ params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session?.user) notFound()
  const companyId = session.user.companyId
  const building = params.building.toUpperCase()
  const lineNo = parseInt(params.line)

  const line = await prisma.line.findUnique({
    where: { companyId_building_lineNo: { companyId, building, lineNo } },
    include: {
      assignments: {
        where: { active: true }, orderBy: { assignedAt: 'desc' },
        include: { model: { include: {
          sections: { include: { operations: { orderBy: { seq: 'asc' } } } }
        }}}
      },
      actuals: { where: { date: today() }, include: { section: true }, orderBy: { hour: 'asc' } },
      alerts: { where: { resolved: false, triggeredAt: { gte: new Date(today() + 'T00:00:00+07:00') } }, orderBy: { triggeredAt: 'desc' } },
    }
  })

  if (!line) notFound()

  const allModels = isIE(session?.user?.role)
    ? await prisma.shoeModel.findMany({
        where: { active: true, companyId },
        select: { id: true, name: true, article: true, lineType: true, sections: { select: { taktTime: true } } },
        orderBy: { name: 'asc' },
      })
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
