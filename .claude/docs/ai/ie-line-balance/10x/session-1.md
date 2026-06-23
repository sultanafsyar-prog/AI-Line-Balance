# 10x Analysis: IE Line Balance
Session 1 | Date: 2026-06-23

## Current Value
Real-time shoe-factory production monitoring. Team Leaders input hourly actuals (output/MP/downtime/defect) per line+section; IE defines models/takt; PPIC sets daily targets; Management watches dashboards + TV andon board. Computes LLER efficiency, auto-generates alerts, AI insights (Claude), Excel export, 3 languages.

## The Question
What turns this from a **scoreboard** (shows what happened) into an **early-warning + intervention system** (changes what happens)?

---

## Massive Opportunities

### 1. Target-miss forecasting (predictive pace)
**What**: Using hourly trend vs daily target, project end-of-shift output and flag "Line 4 akan meleset −180 pairs; butuh +12/jam mulai sekarang."
**Why 10x**: Today the dashboard tells you you missed *after* the shift. This tells you *while you can still fix it*. All data exists (Actual hourly + DailyTarget + remaining hours).
**Effort**: Medium. **Score**: 🔥

### 2. Cross-shift root-cause pattern mining
**What**: Mine Actual + ShiftArchive history: "Downtime Line 4 = 80% 'material shortage' setiap hari jam 14:00–15:00."
**Why 10x**: AI insight is per-day now. Recurring-pattern detection is the moat — it surfaces systemic problems no single shift reveals.
**Effort**: High. **Score**: 👍

### 3. Offline-first PWA for floor tablets
**What**: Hourly input queues locally, syncs when wifi returns; installable on tablets.
**Why 10x**: The core action (hourly input) silently fails on bad factory wifi → lost data → whole system's value collapses. This is reliability insurance.
**Effort**: High. **Score**: 👍

---

## Medium Opportunities

### 1. Shift History viewer  ⭐ BUILDING NOW
**What**: Read the `ShiftArchive` table — list/compare past closed shifts (output, LLER, DT, defect, closed-by).
**Why 10x**: Data is **already captured every shift but never viewable** — pure wasted asset. Unlocks day-vs-day and shift-vs-shift comparison with zero new data work.
**Effort**: Low (read-only). **Score**: 🔥

### 2. Proactive alert delivery (push)
**What**: When a line goes critical, push to WhatsApp/Telegram/email — not just on-screen.
**Why 10x**: Alerts are computed and stored but supervisors aren't staring at the dashboard. Delivery = action in minutes, not at shift end.
**Effort**: Medium. **Score**: 🔥

### 3. Real-time andon (SSE) instead of 60s poll
**What**: Push updates to TV/monitor the instant a leader saves.
**Why**: Andon board should be live; 60s lag undermines "real-time." **Effort**: Medium. **Score**: 🤔

---

## Small Gems

### 1. "Behind schedule" nudge for Team Leader
**What**: System knows which hour slot is empty; show "Jam 10:00 belum diisi" badge.
**Why powerful**: Eliminates the #1 data-quality problem — missing hours. **Effort**: Low. **Score**: 🔥

### 2. "Sama seperti jam lalu" one-tap input
**What**: One button to copy last hour's output/MP. **Effort**: Low. **Score**: 👍

### 3. Require downtime reason when downtime > 0
**What**: Forces root-cause capture at source — makes #2 (pattern mining) possible later. **Effort**: Low. **Score**: 👍

---

## Recommended Priority

### Do Now
1. **Shift History viewer** — captured data, zero risk, immediate value. ← building this session
2. "Behind schedule" nudge + require DT reason — data-quality at the source.

### Do Next
1. Target-miss forecasting — turns dashboard into early warning.
2. Proactive alert delivery — alerts already exist, just undelivered.

### Explore
1. Offline PWA — biggest reliability win, real engineering.
2. Cross-shift root-cause mining — compounding moat.

## Next Steps
- [x] Build Shift History viewer (API + page + nav)
- [ ] Decide channel for alert delivery (WhatsApp Business API vs Telegram vs email)
- [ ] Validate: is bad wifi actually causing lost input today?
