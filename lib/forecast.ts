// ─── FORECAST AKHIR SHIFT ─────────────────────────────────────
// Proyeksi output akhir shift dari pace aktual, dibandingkan target harian.
// Mengubah dashboard dari "papan skor" jadi "peringatan dini".
//
// plannedHours diturunkan dari target itu sendiri (dailyTarget / hourlyTarget)
// — konsisten dengan pemisahan target PPIC (harian) & IE (per jam), tanpa
// asumsi panjang shift.

export type ForecastStatus = 'ontrack' | 'risk' | 'behind' | 'done' | 'nodata'

export interface Forecast {
  pacePerHour: number     // rata-rata output/jam aktual sejauh ini
  remainingHours: number  // sisa jam kerja menurut rencana
  projectedEod: number    // proyeksi output akhir shift
  gap: number             // projectedEod - dailyTarget (negatif = meleset)
  requiredPerHour: number // output/jam yang dibutuhkan untuk kejar target
  status: ForecastStatus
}

export function forecastShift(opts: {
  currentOutput: number
  hoursWithData: number
  dailyTarget: number
  hourlyTarget: number
}): Forecast {
  const { currentOutput, hoursWithData, dailyTarget, hourlyTarget } = opts

  const empty: Forecast = {
    pacePerHour: 0, remainingHours: 0, projectedEod: 0,
    gap: 0, requiredPerHour: 0, status: 'nodata',
  }
  if (hoursWithData <= 0 || dailyTarget <= 0 || hourlyTarget <= 0) return empty

  const pacePerHour = currentOutput / hoursWithData
  const plannedHours = Math.max(Math.round(dailyTarget / hourlyTarget), hoursWithData)
  const remainingHours = Math.max(plannedHours - hoursWithData, 0)
  const projectedEod = Math.round(currentOutput + pacePerHour * remainingHours)
  const gap = projectedEod - dailyTarget
  const requiredPerHour = remainingHours > 0
    ? Math.max(Math.ceil((dailyTarget - currentOutput) / remainingHours), 0)
    : 0

  let status: ForecastStatus
  if (remainingHours === 0) {
    status = currentOutput >= dailyTarget ? 'done' : 'behind'
  } else if (projectedEod >= dailyTarget) {
    status = 'ontrack'
  } else if (gap >= -dailyTarget * 0.1) {
    status = 'risk' // meleset < 10%, masih bisa dikejar
  } else {
    status = 'behind'
  }

  return {
    pacePerHour: Math.round(pacePerHour),
    remainingHours, projectedEod, gap, requiredPerHour, status,
  }
}
