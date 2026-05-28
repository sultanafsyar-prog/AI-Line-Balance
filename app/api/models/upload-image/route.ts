import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/models/upload-image?modelId=xxx
export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (!['IE_ADMIN', 'IT_ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Hanya IE Admin yang bisa upload foto model.' }, { status: 403 })
  }

  // ── Ambil modelId dari query string ──────────────────────
  const { searchParams } = new URL(req.url)
  const modelId = searchParams.get('modelId')
  if (!modelId) {
    return NextResponse.json({ error: 'modelId wajib diisi.' }, { status: 400 })
  }

  const model = await prisma.shoeModel.findUnique({ where: { id: modelId } })
  if (!model) return NextResponse.json({ error: 'Model tidak ditemukan.' }, { status: 404 })

  try {
    const formData = await req.formData()
    const file     = formData.get('image') as File | null
    if (!file) return NextResponse.json({ error: 'File tidak ditemukan di request.' }, { status: 400 })

    // Validasi tipe file
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Hanya file gambar (jpg, png, webp) yang diizinkan.' }, { status: 400 })
    }

    // Validasi ukuran (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Ukuran file maksimal 5MB.' }, { status: 400 })
    }

    const ext      = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const fileName = `${modelId}.${ext}`
    const buffer   = Buffer.from(await file.arrayBuffer())

    // Upload ke Supabase Storage bucket 'model-images'
    const { error: uploadError } = await supabaseAdmin.storage
      .from('model-images')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert:      true,
      })

    if (uploadError) {
      return NextResponse.json(
        { error: `Upload ke Supabase gagal: ${uploadError.message}` },
        { status: 500 }
      )
    }

    // Ambil public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('model-images')
      .getPublicUrl(fileName)

    const imageUrl = urlData.publicUrl

    // Simpan URL ke database — pakai $executeRaw karena kolom imageUrl
    // mungkin belum ada di Prisma client (perlu prisma generate ulang)
    await prisma.$executeRaw`
      UPDATE "ShoeModel"
      SET    "imageUrl" = ${imageUrl}, "updatedAt" = NOW()
      WHERE  id = ${modelId}
    `

    return NextResponse.json({ success: true, imageUrl })

  } catch (e: any) {
    console.error('Upload error:', e)
    return NextResponse.json({ error: e.message ?? 'Upload gagal.' }, { status: 500 })
  }
}

// DELETE /api/models/upload-image?modelId=xxx
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (!['IE_ADMIN', 'IT_ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const modelId = searchParams.get('modelId')
  if (!modelId) return NextResponse.json({ error: 'modelId wajib.' }, { status: 400 })

  try {
    // Ambil URL lama
    const rows = await prisma.$queryRaw<{ imageUrl: string | null }[]>`
      SELECT "imageUrl" FROM "ShoeModel" WHERE id = ${modelId}
    `
    const imageUrl = rows[0]?.imageUrl

    if (imageUrl) {
      const fileName = imageUrl.split('/').pop()
      if (fileName) {
        await supabaseAdmin.storage.from('model-images').remove([fileName])
      }
    }

    // Hapus URL dari database
    await prisma.$executeRaw`
      UPDATE "ShoeModel"
      SET    "imageUrl" = NULL, "updatedAt" = NOW()
      WHERE  id = ${modelId}
    `

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}