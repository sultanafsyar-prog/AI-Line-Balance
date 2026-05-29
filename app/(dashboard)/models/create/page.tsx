import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { isIE } from '@/lib/utils'

export default async function ModelCreatePage() {
  const session = await getServerSession(authOptions)

  if (!session || !isIE(session.user.role)) {
    redirect('/dashboard')
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Create Model Page</h1>
      <p>Temporary page setup successful.</p>
    </div>
  )
}