// ─── PENGIRIMAN ALERT PROAKTIF ────────────────────────────────
// Kirim notifikasi alert kritis ke Telegram supaya supervisor bertindak
// dalam menit, bukan menunggu lihat dashboard. Pola sama dgn Resend email:
// kalau env tidak diset, diam-diam dilewati (tidak error).
//
// Setup: buat bot via @BotFather → TELEGRAM_BOT_TOKEN.
// Chat id grup/personal → TELEGRAM_CHAT_ID.

export async function sendTelegramAlert(text: string): Promise<boolean> {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return false

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

// Format pesan alert standar
export function formatAlertMessage(opts: {
  lineTag: string
  section: string
  type: string
  message: string
}): string {
  const icon = opts.type === 'OUTPUT_LOW' ? '📉'
    : opts.type === 'DOWNTIME_HIGH' ? '⏱️'
    : opts.type === 'DEFECT_HIGH' ? '⚠️' : '🔔'
  return `${icon} <b>${opts.lineTag}</b> · ${opts.section}\n${opts.message}`
}
