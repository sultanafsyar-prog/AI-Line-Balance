import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ManagerClient from './client'

export default async function ManagerPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const user = session.user
  if (user.role !== 'MANAGEMENT' && user.role !== 'IE_ADMIN' && user.role !== 'IT_ADMIN') {
    redirect('/dashboard')
  }

  return <ManagerClient userBuilding={user.building ?? null} userName={user.name ?? ''} />
}