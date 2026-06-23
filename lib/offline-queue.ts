// ─── ANTRIAN INPUT OFFLINE ────────────────────────────────────
// Team leader input per jam di tablet floor dengan wifi sering putus.
// Kalau POST gagal karena jaringan, simpan ke localStorage dan kirim ulang
// otomatis saat online kembali. Error server (validasi/akses) TIDAK diantri.

const KEY = 'ie-actual-queue'
type QueuedActual = { body: Record<string, unknown>; ts: number }

function read(): QueuedActual[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
function write(q: QueuedActual[]) {
  try { localStorage.setItem(KEY, JSON.stringify(q)) } catch {}
}

export function queuedCount(): number {
  return read().length
}

// POST actual; kalau gagal jaringan → antri offline.
export async function postActual(
  body: Record<string, unknown>,
): Promise<{ ok: boolean; queued: boolean; error?: string }> {
  try {
    const res = await fetch('/api/actuals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) return { ok: true, queued: false }
    // Error dari server (validasi/akses/shift terkunci) — bukan masalah jaringan, jangan antri
    const d = await res.json().catch(() => ({}))
    return { ok: false, queued: false, error: d.error }
  } catch {
    const q = read()
    q.push({ body, ts: Date.now() })
    write(q)
    return { ok: false, queued: true }
  }
}

// Kirim ulang semua antrian. Return jumlah yang berhasil terkirim.
export async function flushQueue(): Promise<number> {
  const q = read()
  if (q.length === 0) return 0
  let sent = 0
  const remaining: QueuedActual[] = []
  for (const item of q) {
    try {
      const res = await fetch('/api/actuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.body),
      })
      if (res.ok) { sent++; continue }
      // 4xx = error permanen (validasi/akses), buang supaya tidak nyangkut selamanya
      if (res.status >= 400 && res.status < 500) continue
      remaining.push(item) // 5xx → coba lagi nanti
    } catch {
      remaining.push(item) // masih offline
    }
  }
  write(remaining)
  return sent
}
