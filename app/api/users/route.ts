import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isAdmin } from '@/lib/utils'
import bcrypt from 'bcryptjs'

// GET /api/users
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || !isAdmin((session.user as any)?.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true, name: true, email: true, role: true,
        building: true, active: true, createdAt: true,
        lineAccess: { include: { line: { select: { id: true, building: true, lineNo: true } } } },
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    })
    return NextResponse.json(users)
  } catch (e: any) {
    // Fallback jika UserLine belum ada
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, building: true, active: true, createdAt: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    })
    return NextResponse.json(users.map(u => ({ ...u, lineAccess: [] })))
  }
}

// POST /api/users
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !isAdmin((session.user as any)?.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, email, password, role, building, lineIds } = await req.json()
  if (!name || !email || !password || !role)
    return NextResponse.json({ error: 'Nama, email, password, dan role wajib diisi' }, { status: 400 })

  const exists = await prisma.user.findUnique({ where: { email } })
  if (exists) return NextResponse.json({ error: 'Email sudah terdaftar' }, { status: 409 })

  const hashed = await bcrypt.hash(password, 12)

  try {
    const user = await prisma.user.create({
      data: {
        name, email, password: hashed, role,
        building: building || null,
        lineAccess: lineIds?.length > 0 ? {
          create: lineIds.map((lineId: string) => ({ lineId }))
        } : undefined,
      },
      select: {
        id: true, name: true, email: true, role: true,
        building: true, active: true, createdAt: true,
        lineAccess: { include: { line: { select: { id: true, building: true, lineNo: true } } } },
      },
    })
    return NextResponse.json(user, { status: 201 })
  } catch (e: any) {
    // Fallback tanpa lineAccess
    const user = await prisma.user.create({
      data: { name, email, password: hashed, role, building: building || null },
      select: { id: true, name: true, email: true, role: true, building: true, active: true, createdAt: true },
    })
    return NextResponse.json({ ...user, lineAccess: [] }, { status: 201 })
  }
}

// PATCH /api/users
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !isAdmin((session.user as any)?.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, name, role, building, active, password, lineIds } = await req.json()
  if (!id) return NextResponse.json({ error: 'ID wajib diisi' }, { status: 400 })

  const data: any = {}
  if (name)               data.name     = name
  if (role)               data.role     = role
  if (building !== undefined) data.building = building || null
  if (active   !== undefined) data.active   = active
  if (password) data.password = await bcrypt.hash(password, 12)

  // Update line access
  if (lineIds !== undefined) {
    try {
      await prisma.userLine.deleteMany({ where: { userId: id } })
      if (lineIds.length > 0) {
        await prisma.userLine.createMany({
          data: lineIds.map((lineId: string) => ({ userId: id, lineId }))
        })
      }
    } catch (e) {
      // UserLine belum ada, skip
    }
  }

  try {
    const user = await prisma.user.update({
      where: { id }, data,
      select: {
        id: true, name: true, email: true, role: true,
        building: true, active: true, createdAt: true,
        lineAccess: { include: { line: { select: { id: true, building: true, lineNo: true } } } },
      },
    })
    return NextResponse.json(user)
  } catch (e: any) {
    const user = await prisma.user.update({
      where: { id }, data,
      select: { id: true, name: true, email: true, role: true, building: true, active: true, createdAt: true },
    })
    return NextResponse.json({ ...user, lineAccess: [] })
  }
}