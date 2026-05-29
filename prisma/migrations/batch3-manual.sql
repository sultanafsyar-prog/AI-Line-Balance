-- ════════════════════════════════════════════════════════════
-- BATCH 3 MIGRATION
-- Tanggal generate: 2026-05-29
-- ════════════════════════════════════════════════════════════
-- Jalankan SQL ini SEKALI di Supabase SQL Editor.
-- Aman dijalankan ulang (idempotent) — pakai IF NOT EXISTS.
-- Tidak ada risiko data loss.
-- ════════════════════════════════════════════════════════════

-- 1. Tambah kolom imageUrl ke ShoeModel (kalau belum ada)
--    Di production DB sudah ada (dari migration manual sebelumnya).
--    Statement ini sebagai jaring pengaman supaya DB development baru tidak gagal.
ALTER TABLE "ShoeModel"
  ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

-- 2. Tambah kolom shiftClosed ke Actual
--    Default false → semua data lama tetap valid.
ALTER TABLE "Actual"
  ADD COLUMN IF NOT EXISTS "shiftClosed" BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Index untuk filter query shift closed
CREATE INDEX IF NOT EXISTS "Actual_lineId_date_shiftClosed_idx"
  ON "Actual" ("lineId", "date", "shiftClosed");

-- 4. Buat tabel ShiftArchive untuk audit log shift yang ditutup
CREATE TABLE IF NOT EXISTS "ShiftArchive" (
  "id"           TEXT PRIMARY KEY,
  "lineId"       TEXT NOT NULL,
  "date"         TEXT NOT NULL,
  "shiftLabel"   TEXT NOT NULL,
  "closedBy"     TEXT NOT NULL,
  "closedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "totalOutput"  INTEGER NOT NULL,
  "totalDT"      INTEGER NOT NULL,
  "totalDefect"  INTEGER NOT NULL,
  "avgLler"      INTEGER NOT NULL,
  "managerEmail" TEXT,
  "emailSent"    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS "ShiftArchive_lineId_date_idx"
  ON "ShiftArchive" ("lineId", "date");

CREATE INDEX IF NOT EXISTS "ShiftArchive_closedAt_idx"
  ON "ShiftArchive" ("closedAt");

-- ════════════════════════════════════════════════════════════
-- VERIFIKASI — jalankan setelah migration di atas
-- ════════════════════════════════════════════════════════════
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'Actual' AND column_name = 'shiftClosed';
--
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name = 'ShiftArchive';
