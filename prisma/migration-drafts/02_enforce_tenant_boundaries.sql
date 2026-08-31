-- DRAFT ONLY — run on staging after 01_add_company_boundary.sql.
-- Production must wait until the application reads companyId from its session.

BEGIN;

-- IDs remain globally unique, while these extra keys let PostgreSQL enforce
-- that every parent/child relationship belongs to the same company.
ALTER TABLE "User"      ADD CONSTRAINT "User_companyId_id_key" UNIQUE ("companyId", "id");
ALTER TABLE "Line"      ADD CONSTRAINT "Line_companyId_id_key" UNIQUE ("companyId", "id");
ALTER TABLE "ShoeModel" ADD CONSTRAINT "ShoeModel_companyId_id_key" UNIQUE ("companyId", "id");
ALTER TABLE "Section"   ADD CONSTRAINT "Section_companyId_id_key" UNIQUE ("companyId", "id");

-- Business identifiers are unique inside a company, not across all companies.
DROP INDEX "User_email_key";
DROP INDEX "ShoeModel_name_key";
DROP INDEX "Line_building_lineNo_key";
CREATE UNIQUE INDEX "User_companyId_email_key" ON "User" ("companyId", "email");
CREATE UNIQUE INDEX "ShoeModel_companyId_name_key" ON "ShoeModel" ("companyId", "name");
CREATE UNIQUE INDEX "Line_companyId_building_lineNo_key" ON "Line" ("companyId", "building", "lineNo");

ALTER TABLE "UserLine"
  ADD CONSTRAINT "UserLine_company_user_fkey"
  FOREIGN KEY ("companyId", "userId") REFERENCES "User" ("companyId", "id") ON DELETE CASCADE;
ALTER TABLE "UserLine"
  ADD CONSTRAINT "UserLine_company_line_fkey"
  FOREIGN KEY ("companyId", "lineId") REFERENCES "Line" ("companyId", "id") ON DELETE CASCADE;
ALTER TABLE "DailyTarget"
  ADD CONSTRAINT "DailyTarget_company_line_fkey"
  FOREIGN KEY ("companyId", "lineId") REFERENCES "Line" ("companyId", "id") ON DELETE CASCADE;
ALTER TABLE "Section"
  ADD CONSTRAINT "Section_company_model_fkey"
  FOREIGN KEY ("companyId", "modelId") REFERENCES "ShoeModel" ("companyId", "id") ON DELETE CASCADE;
ALTER TABLE "Operation"
  ADD CONSTRAINT "Operation_company_section_fkey"
  FOREIGN KEY ("companyId", "sectionId") REFERENCES "Section" ("companyId", "id") ON DELETE CASCADE;
ALTER TABLE "LineAssignment"
  ADD CONSTRAINT "LineAssignment_company_line_fkey"
  FOREIGN KEY ("companyId", "lineId") REFERENCES "Line" ("companyId", "id") ON DELETE RESTRICT;
ALTER TABLE "LineAssignment"
  ADD CONSTRAINT "LineAssignment_company_model_fkey"
  FOREIGN KEY ("companyId", "modelId") REFERENCES "ShoeModel" ("companyId", "id") ON DELETE RESTRICT;
ALTER TABLE "Actual"
  ADD CONSTRAINT "Actual_company_line_fkey"
  FOREIGN KEY ("companyId", "lineId") REFERENCES "Line" ("companyId", "id") ON DELETE RESTRICT;
ALTER TABLE "Actual"
  ADD CONSTRAINT "Actual_company_section_fkey"
  FOREIGN KEY ("companyId", "sectionId") REFERENCES "Section" ("companyId", "id") ON DELETE RESTRICT;
ALTER TABLE "Actual"
  ADD CONSTRAINT "Actual_company_user_fkey"
  FOREIGN KEY ("companyId", "inputBy") REFERENCES "User" ("companyId", "id") ON DELETE RESTRICT;
ALTER TABLE "ShiftArchive"
  ADD CONSTRAINT "ShiftArchive_company_line_fkey"
  FOREIGN KEY ("companyId", "lineId") REFERENCES "Line" ("companyId", "id") ON DELETE RESTRICT;
ALTER TABLE "Alert"
  ADD CONSTRAINT "Alert_company_line_fkey"
  FOREIGN KEY ("companyId", "lineId") REFERENCES "Line" ("companyId", "id") ON DELETE RESTRICT;

COMMIT;

-- Verification test. Expected result: the final cross-company insert is
-- rejected by LineAssignment_company_line_fkey and the transaction rolls back.
BEGIN;
INSERT INTO "Company" ("id", "code", "name") VALUES
  ('company_test_a', 'TEST-A', 'Perusahaan Test A'),
  ('company_test_b', 'TEST-B', 'Perusahaan Test B');
INSERT INTO "Line" ("id", "companyId", "building", "lineNo") VALUES
  ('line_test_a', 'company_test_a', 'D', 1),
  ('line_test_b', 'company_test_b', 'D', 1);
INSERT INTO "ShoeModel" ("id", "companyId", "name", "article", "updatedAt") VALUES
  ('model_test_a', 'company_test_a', 'STYLE-SAMA', 'A-001', CURRENT_TIMESTAMP),
  ('model_test_b', 'company_test_b', 'STYLE-SAMA', 'B-001', CURRENT_TIMESTAMP);
DO $$
BEGIN
  BEGIN
    INSERT INTO "LineAssignment" ("id", "companyId", "lineId", "modelId", "assignedBy")
    VALUES ('assignment_cross_tenant', 'company_test_b', 'line_test_a', 'model_test_b', 'test');
    RAISE EXCEPTION 'Tenant boundary gagal: relasi silang perusahaan diterima';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;
END $$;
ROLLBACK;

SELECT 'tenant constraints installed' AS result;
