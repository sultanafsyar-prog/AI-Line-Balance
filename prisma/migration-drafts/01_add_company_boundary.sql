-- DRAFT ONLY — intentionally outside prisma/migrations.
-- Do not run on production before backup/restore testing and application support.
-- Backward-compatible phase: all existing and new legacy-app rows stay in
-- company_default until the application starts writing an explicit companyId.

BEGIN;

CREATE TABLE IF NOT EXISTS "Company" (
  "id"        TEXT        PRIMARY KEY,
  "code"      TEXT        NOT NULL UNIQUE,
  "name"      TEXT        NOT NULL,
  "active"    BOOLEAN     NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "CompanySetting" (
  "companyId"  TEXT        PRIMARY KEY REFERENCES "Company"("id") ON DELETE CASCADE,
  "timezone"   TEXT        NOT NULL DEFAULT 'Asia/Jakarta',
  "locale"     TEXT        NOT NULL DEFAULT 'id-ID',
  "dateFormat" TEXT        NOT NULL DEFAULT 'dd/MM/yyyy',
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "Company" ("id", "code", "name")
VALUES ('company_default', 'DEFAULT', 'Perusahaan Utama')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "CompanySetting" ("companyId")
VALUES ('company_default')
ON CONFLICT ("companyId") DO NOTHING;

ALTER TABLE "User"           ADD COLUMN IF NOT EXISTS "companyId" TEXT DEFAULT 'company_default';
ALTER TABLE "UserLine"       ADD COLUMN IF NOT EXISTS "companyId" TEXT DEFAULT 'company_default';
ALTER TABLE "ShoeModel"      ADD COLUMN IF NOT EXISTS "companyId" TEXT DEFAULT 'company_default';
ALTER TABLE "DailyTarget"    ADD COLUMN IF NOT EXISTS "companyId" TEXT DEFAULT 'company_default';
ALTER TABLE "Section"        ADD COLUMN IF NOT EXISTS "companyId" TEXT DEFAULT 'company_default';
ALTER TABLE "Operation"      ADD COLUMN IF NOT EXISTS "companyId" TEXT DEFAULT 'company_default';
ALTER TABLE "Line"           ADD COLUMN IF NOT EXISTS "companyId" TEXT DEFAULT 'company_default';
ALTER TABLE "LineAssignment" ADD COLUMN IF NOT EXISTS "companyId" TEXT DEFAULT 'company_default';
ALTER TABLE "Actual"         ADD COLUMN IF NOT EXISTS "companyId" TEXT DEFAULT 'company_default';
ALTER TABLE "ShiftArchive"   ADD COLUMN IF NOT EXISTS "companyId" TEXT DEFAULT 'company_default';
ALTER TABLE "Alert"          ADD COLUMN IF NOT EXISTS "companyId" TEXT DEFAULT 'company_default';

UPDATE "User"           SET "companyId" = 'company_default' WHERE "companyId" IS NULL;
UPDATE "UserLine"       SET "companyId" = 'company_default' WHERE "companyId" IS NULL;
UPDATE "ShoeModel"      SET "companyId" = 'company_default' WHERE "companyId" IS NULL;
UPDATE "DailyTarget"    SET "companyId" = 'company_default' WHERE "companyId" IS NULL;
UPDATE "Section"        SET "companyId" = 'company_default' WHERE "companyId" IS NULL;
UPDATE "Operation"      SET "companyId" = 'company_default' WHERE "companyId" IS NULL;
UPDATE "Line"           SET "companyId" = 'company_default' WHERE "companyId" IS NULL;
UPDATE "LineAssignment" SET "companyId" = 'company_default' WHERE "companyId" IS NULL;
UPDATE "Actual"         SET "companyId" = 'company_default' WHERE "companyId" IS NULL;
UPDATE "ShiftArchive"   SET "companyId" = 'company_default' WHERE "companyId" IS NULL;
UPDATE "Alert"          SET "companyId" = 'company_default' WHERE "companyId" IS NULL;

DO $$
DECLARE
  table_name TEXT;
  null_count BIGINT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'User', 'UserLine', 'ShoeModel', 'DailyTarget', 'Section', 'Operation',
    'Line', 'LineAssignment', 'Actual', 'ShiftArchive', 'Alert'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE "companyId" IS NULL', table_name)
      INTO null_count;
    IF null_count > 0 THEN
      RAISE EXCEPTION 'Backfill companyId gagal: tabel % masih memiliki % baris NULL',
        table_name, null_count;
    END IF;
  END LOOP;
END $$;

ALTER TABLE "User"           ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "UserLine"       ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "ShoeModel"      ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "DailyTarget"    ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Section"        ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Operation"      ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Line"           ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "LineAssignment" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Actual"         ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "ShiftArchive"   ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Alert"          ALTER COLUMN "companyId" SET NOT NULL;

DO $$
DECLARE
  table_name TEXT;
  constraint_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'User', 'UserLine', 'ShoeModel', 'DailyTarget', 'Section', 'Operation',
    'Line', 'LineAssignment', 'Actual', 'ShiftArchive', 'Alert'
  ] LOOP
    constraint_name := table_name || '_companyId_fkey';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = constraint_name
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT',
        table_name, constraint_name
      );
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Run indexes separately after the transaction. On a large production table,
-- CONCURRENTLY avoids blocking normal reads/writes.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_companyId_idx"           ON "User" ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "UserLine_companyId_idx"       ON "UserLine" ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ShoeModel_companyId_idx"      ON "ShoeModel" ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "DailyTarget_companyId_idx"    ON "DailyTarget" ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Section_companyId_idx"        ON "Section" ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Operation_companyId_idx"      ON "Operation" ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Line_companyId_idx"           ON "Line" ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "LineAssignment_companyId_idx" ON "LineAssignment" ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Actual_companyId_idx"         ON "Actual" ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ShiftArchive_companyId_idx"   ON "ShiftArchive" ("companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Alert_companyId_idx"          ON "Alert" ("companyId");

-- Verification: every result must be zero.
SELECT 'User' AS table_name, count(*) AS invalid_rows FROM "User" u
WHERE NOT EXISTS (SELECT 1 FROM "Company" c WHERE c.id = u."companyId")
UNION ALL SELECT 'UserLine', count(*) FROM "UserLine" t WHERE NOT EXISTS (SELECT 1 FROM "Company" c WHERE c.id = t."companyId")
UNION ALL SELECT 'ShoeModel', count(*) FROM "ShoeModel" t WHERE NOT EXISTS (SELECT 1 FROM "Company" c WHERE c.id = t."companyId")
UNION ALL SELECT 'DailyTarget', count(*) FROM "DailyTarget" t WHERE NOT EXISTS (SELECT 1 FROM "Company" c WHERE c.id = t."companyId")
UNION ALL SELECT 'Section', count(*) FROM "Section" t WHERE NOT EXISTS (SELECT 1 FROM "Company" c WHERE c.id = t."companyId")
UNION ALL SELECT 'Operation', count(*) FROM "Operation" t WHERE NOT EXISTS (SELECT 1 FROM "Company" c WHERE c.id = t."companyId")
UNION ALL SELECT 'Line', count(*) FROM "Line" t WHERE NOT EXISTS (SELECT 1 FROM "Company" c WHERE c.id = t."companyId")
UNION ALL SELECT 'LineAssignment', count(*) FROM "LineAssignment" t WHERE NOT EXISTS (SELECT 1 FROM "Company" c WHERE c.id = t."companyId")
UNION ALL SELECT 'Actual', count(*) FROM "Actual" t WHERE NOT EXISTS (SELECT 1 FROM "Company" c WHERE c.id = t."companyId")
UNION ALL SELECT 'ShiftArchive', count(*) FROM "ShiftArchive" t WHERE NOT EXISTS (SELECT 1 FROM "Company" c WHERE c.id = t."companyId")
UNION ALL SELECT 'Alert', count(*) FROM "Alert" t WHERE NOT EXISTS (SELECT 1 FROM "Company" c WHERE c.id = t."companyId");

-- Deliberately omitted here:
-- 1. removing the temporary company_default column defaults;
-- 2. changing email/model/line unique constraints;
-- 3. inserting a second company.
-- Those happen only after the application is fully tenant-aware.
