import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createClient } from '@supabase/supabase-js'
import { jsonError, requireRole } from '@/lib/api-helpers'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diset.')
  }
  return createClient(url, key)
}

// POST /api/models/upload-image?modelId=xxx
export async function POST(req: NextRequest) {
  const auth = await requireRole(['IE_ADMIN', 'IT_ADMIN'])
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const modelId = searchParams.get('modelId')
  if (!modelId) return jsonError('modelId wajib diisi.', 400)

  const model = await prisma.shoeModel.findUnique({ where: { id: modelId } })
  if (!model) return jsonError('Model tidak ditemukan.', 404)

  try {
    const formData = await req.formData()
    const file = formData.get('image')
    if (!(file instanceof File)) {
      return jsonError('File tidak ditemukan di request.', 400)
    }

    if (!file.type.startsWith('image/')) {
      return jsonError('Hanya file gambar (jpg, png, webp) yang diizinkan.', 400)
    }
    if (file.size > 5 * 1024 * 1024) {
      return jsonError('Ukuran file maksimal 5MB.', 400)
    }

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const fileName = `${modelId}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const supabase = getSupabase()
    const { error: uploadError } = await supabase.storage
      .from('model-images')
      .upload(fileName, buffer, { contentType: file.type, upsert: true })

    if (uploadError) {
      return jsonError(`Upload ke Supabase gagal: ${uploadError.message}`, 500)
    }

    const { data: urlData } = supabase.storage
      .from('model-images')
      .getPublicUrl(fileName)
    const imageUrl = urlData.publicUrl

    // Sekarang sudah typed di Prisma — tidak perlu $executeRaw lagi
    await prisma.shoeModel.update({
      where: { id: modelId },
      data: { imageUrl },
    })

    return NextResponse.json({ success: true, imageUrl })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Upload gagal.'
    console.error('upload-image POST', msg)
    return jsonError(msg, 500)
  }
}

// DELETE /api/models/upload-image?modelId=xxx
export async function DELETE(req: NextRequest) {
  const auth = await requireRole(['IE_ADMIN', 'IT_ADMIN'])
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const modelId = searchParams.get('modelId')
  if (!modelId) return jsonError('modelId wajib.', 400)

  try {
    const model = await prisma.shoeModel.findUnique({
      where: { id: modelId },
      select: { imageUrl: true },
    })

    if (model?.imageUrl) {
      const fileName = model.imageUrl.split('/').pop()
      if (fileName) {
        const supabase = getSupabase()
        await supabase.storage.from('model-images').remove([fileName])
      }
    }

    await prisma.shoeModel.update({
      where: { id: modelId },
      data: { imageUrl: null },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Delete gagal.'
    return jsonError(msg, 500)
  }
}
