import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/api-helpers'
import { getShiftArchives } from '@/lib/shift-archive-query'

// GET /api/shift-archive?building=D&days=30
// Riwayat shift yang sudah ditutup (dari tabel ShiftArchive), diperkaya
// dengan target harian (PPIC) + section/style yang dijalankan.
export async function GET(req: NextRequest) {
  const auth = await requireSession()
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const building = searchParams.get('building')
  const days = parseInt(searchParams.get('days') ?? '30', 10)

  const archives = await getShiftArchives(auth, { building, days })
  return NextResponse.json({ archives })
}
