import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { today } from '@/lib/utils'
import LeaderClient from './client'

export default async function LeaderPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const user = session.user as any
  if (user.role !== 'TEAM_LEADER') redirect('/dashboard')

  // Ambil semua line yang di-assign ke team leader ini
  const userLines = await prisma.userLine.findMany({
    where: { userId: user.id },
    include: {
      line: {
        include: {
          assignments: {
            where: { active: true }, take: 1,
            orderBy: { assignedAt: 'desc' },
            include: {
              model: {
                include: {
                  sections: {
                    include: { operations: { orderBy: { seq: 'asc' } } }
                  }
                }
              }
            }
          },
          actuals: {
            where: { date: today() },
            include: { section: true },
            orderBy: { hour: 'desc' },
          },
          alerts: { where: { resolved: false } },
        }
      }
    }
  })

  const lines = userLines.map(ul => ul.line)

  return <LeaderClient lines={lines as any} userId={user.id} userName={user.name} />
}
