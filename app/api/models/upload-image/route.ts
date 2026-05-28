import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface Props { params: { id: string } }

export async function POST(req: NextRequest, { params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (!['IE_ADMIN', 'IT_ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Hanya IE Admin yang bisa upload foto model.' }, { status: 403 })
  }

  const modelId = params.id
  const model   = await prisma.shoeModel.findUnique({ where: { id: modelId } })
  if (!model) return NextResponse.json({ error: 'Model tidak ditemukan.' }, { status: 404 })

  try {
    const formData = await req.formData()
    const file     = formData.get('image') as File | null
    if (!file) return NextResponse.json({ error: 'File tidak ditemukan.' }, { status: 400 })

    // Validasi tipe file
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Hanya file gambar yang diizinkan.' }, { status: 400 })
    }

    // Validasi ukuran (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Ukuran file maksimal 5MB.' }, { status: 400 })
    }

    const ext      = file.name.split('.').pop() ?? 'jpg'
    const fileName = `${modelId}.${ext}`
    const buffer   = Buffer.from(await file.arrayBuffer())

    // Upload ke Supabase Storage bucket 'model-images'
    const { error: uploadError } = await supabaseAdmin.storage
      .from('model-images')
      .upload(fileName, buffer, {
        contentType:  file.type,
        upsert:       true, // overwrite jika sudah ada
      })

    if (uploadError) {
      return NextResponse.json({ error: `Upload gagal: ${uploadError.message}` }, { status: 500 })
    }

    // Ambil public URL
    const { data: urlData } = supabaseAdmin.storage
      .from('model-images')
      .getPublicUrl(fileName)

    const imageUrl = urlData.publicUrl

    // Simpan URL ke database
    await prisma.shoeModel.update({
      where: { id: modelId },
      data:  { imageUrl } as any
    })

    return NextResponse.json({ success: true, imageUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE — hapus foto model
export async function DELETE(req: NextRequest, { params }: Props) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (!['IE_ADMIN', 'IT_ADMIN'].includes(user.role)) {
    return NextResponse.json({ error: 'Tidak diizinkan.' }, { status: 403 })
  }

  const modelId = params.id
  const model   = await (prisma.shoeModel as any).findUnique({ where: { id: modelId } })
  if (!model?.imageUrl) return NextResponse.json({ success: true })

  // Hapus dari storage
  const fileName = model.imageUrl.split('/').pop()
  if (fileName) {
    await supabaseAdmin.storage.from('model-images').remove([fileName])
  }

  // Hapus URL dari database
  await prisma.shoeModel.update({
    where: { id: modelId },
    data:  { imageUrl: null } as any
  })

  return NextResponse.json({ success: true })
}
