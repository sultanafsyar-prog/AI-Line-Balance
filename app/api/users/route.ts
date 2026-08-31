import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { requireRole, parseBody } from '@/lib/api-helpers'
import { UserCreateSchema, UserPatchSchema } from '@/lib/validation'

const ADMIN_ROLES = ['IE_ADMIN', 'IT_ADMIN'] as const

// GET /api/users
export async function GET() {
  const auth = await requireRole([...ADMIN_ROLES])
  if (auth instanceof NextResponse) return auth

  const users = await prisma.user.findMany({
    where: { companyId: auth.user.companyId },
    select: {
      id: true, name: true, email: true, role: true,
      building: true, active: true, createdAt: true,
      lineAccess: {
        include: { line: { select: { id: true, building: true, lineNo: true } } }
      },
    },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  })
  return NextResponse.json(users)
}

// POST /api/users
export async function POST(req: NextRequest) {
  const auth = await requireRole([...ADMIN_ROLES])
  if (auth instanceof NextResponse) return auth

  const parsed = await parseBody(req, UserCreateSchema)
  if (parsed instanceof NextResponse) return parsed
  const { name, email, password, role, building, lineIds } = parsed

  const companyId = auth.user.companyId
  const normalizedEmail = email.trim().toLowerCase()
  const exists = await prisma.user.findUnique({
    where: { companyId_email: { companyId, email: normalizedEmail } },
  })
  if (exists) return NextResponse.json({ error: 'Email sudah terdaftar' }, { status: 409 })

  const hashed = await bcrypt.hash(password, 12)

  const user = await prisma.user.create({
    data: {
      companyId, name, email: normalizedEmail, password: hashed, role,
      building: building || null,
      lineAccess: lineIds && lineIds.length > 0 ? {
        create: lineIds.map((lineId: string) => ({ companyId, lineId }))
      } : undefined,
    },
    select: {
      id: true, name: true, email: true, role: true,
      building: true, active: true, createdAt: true,
      lineAccess: {
        include: { line: { select: { id: true, building: true, lineNo: true } } }
      },
    },
  })
  return NextResponse.json(user, { status: 201 })
}

// PATCH /api/users
export async function PATCH(req: NextRequest) {
  const auth = await requireRole([...ADMIN_ROLES])
  if (auth instanceof NextResponse) return auth

  const parsed = await parseBody(req, UserPatchSchema)
  if (parsed instanceof NextResponse) return parsed
  const { id, name, role, building, active, password, lineIds } = parsed
  const companyId = auth.user.companyId
  const owned = await prisma.user.findFirst({ where: { id, companyId }, select: { id: true } })
  if (!owned) return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (name     !== undefined) data.name     = name
  if (role     !== undefined) data.role     = role
  if (building !== undefined) data.building = building || null
  if (active   !== undefined) data.active   = active
  if (password !== undefined) data.password = await bcrypt.hash(password, 12)

  // Update line access dalam transaksi supaya konsisten
  if (lineIds !== undefined) {
    await prisma.$transaction([
      prisma.userLine.deleteMany({ where: { userId: id, companyId } }),
      ...(lineIds.length > 0
        ? [prisma.userLine.createMany({
            data: lineIds.map((lineId: string) => ({ companyId, userId: id, lineId })),
          })]
        : []),
    ])
  }

  const user = await prisma.user.update({
    where: { id, companyId }, data,
    select: {
      id: true, name: true, email: true, role: true,
      building: true, active: true, createdAt: true,
      lineAccess: {
        include: { line: { select: { id: true, building: true, lineNo: true } } }
      },
    },
  })
  return NextResponse.json(user)
}
